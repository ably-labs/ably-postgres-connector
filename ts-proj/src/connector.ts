const { Client } = require("pg");
const Ably = require("ably");
const fs = require("fs");

let ably, client, connector;

const setup = async (filepath: string) => {
  const rawdata = fs.readFileSync(filepath);
  const config = JSON.parse(rawdata);
  const dbConfig = config["dbConfig"];
  connector = config["connector"];
  const ablyOptions = config["ably"];

  // instantiate Ably
  ably = new Ably.Rest(ablyOptions.apiKey);

  // instantiate node-postgresconnector client
  client = new Client(dbConfig);
  await client.connect();

  try {
    // listen on a particular data channel
    await client.query('LISTEN "table_update"');
    // on trigger of notification by pg_notify
    client.on("notification", function (data) {
      if (data.channel === "table_update") {
        const notifyData = JSON.parse(data.payload);
        const operation = notifyData.type;
        const tableName = notifyData.table;
        const queryGetAblyChannelName = `Select ablychannelname from ablycontroltable where tablename='${tableName}' and operation='${operation}'`;
        
        // get the ably channel to publish data change on
        client.query(queryGetAblyChannelName, (err, res) => {
          if (err) {
            console.log(err.stack);
          } else {
            if (res.rows.length != 0) {
              const channel = ably.channels.get(res.rows[0].ablychannelname);
              
              // Publish message to Ably channel
              channel.publish(
                "New message from the Ably/ Postgres connector",
                data.payload
              );
            } else {
              console.log("Matching config not found!");
            }
          }
        });
      }
    });
  } catch (err) {
    console.log(err.stack);
  }
};

// Rollback in case of error during transaction
const shouldAbort = (err) => {
  if (err) {
    console.error("Error in transaction", err.stack);
    client.query("ROLLBACK", (err) => {
      if (err) {
        console.error("Error rolling back client", err.stack);
      }
    });
  }
  return !!err;
};

export const postgresconnector = async (filepath: string) => {
  // Setup Ably postgresconnector 
  await setup(filepath);
  client.query("BEGIN", (err) => {
    if (shouldAbort(err)) return;

    // Create fn to trigger the pg_notify on data change
    const queryText = `CREATE OR REPLACE FUNCTION ably_notify() RETURNS trigger AS $$
      DECLARE
        rec record;
      BEGIN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
          rec = NEW;
        ELSE
          rec = OLD;
        END IF;
      PERFORM pg_notify('table_update', json_build_object('table', TG_TABLE_NAME, 'type', TG_OP, 'row', rec)::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;`;
    client.query(queryText, (err, res) => {
      if (shouldAbort(err)) return;

      // Create Ably config table, to maintain table-to-ablychannel mapping
      const createCtrlTable = `CREATE TABLE IF NOT EXISTS ablycontroltable(tablename VARCHAR(100) NOT NULL, ablychannelname VARCHAR(100) NOT NULL, operation VARCHAR(50), 
        PRIMARY KEY(tablename, ablychannelname, operation));`;
      client.query(createCtrlTable, (err, res) => {
        if (shouldAbort(err)) return;

        let deleteQuery = `Delete from ablycontroltable where not (`;
        let selDropQuery = `Select * from ablycontroltable where not (`;
        let commonQueryPart = ``;

        for (let i = 0; i < connector.length; i++) {
          const tableName = connector[i].tablename;
          const op = connector[i].operation;
          const ablyChannel = connector[i].ablychannelname;
          if (i == 0) {
            commonQueryPart += `(tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}')`;
          } else {
            commonQueryPart += ` or (tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}')`;
          }
          let queryCtrlTable = `SELECT * from ablycontroltable where tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}'`;
          client.query(queryCtrlTable, (err, res) => {
            if (shouldAbort(err)) return;

            if (res.rows.length == 0) {
              const insertData =
                "INSERT INTO ablycontroltable(tablename, ablychannelname, operation) VALUES($1, $2, $3) RETURNING *";
              const values = [tableName, ablyChannel, op];

              // Insert mapping into the Ably config table
              client.query(insertData, values, (err, res) => {
                if (err) {
                  console.log(err.stack);
                }

                // Create trigger for the particular table & DB operation combination
                const createTrigger = `CREATE TRIGGER ${tableName}_notify_${op} AFTER ${op} ON ${tableName} FOR EACH ROW EXECUTE PROCEDURE ably_notify();`;
                client.query(createTrigger, (err, res) => {
                  if (err) {
                    console.log(err.stack);
                  }
                });
              });
            }
          });
        }
        commonQueryPart += ");";
        deleteQuery += commonQueryPart;
        selDropQuery += commonQueryPart;

        // Manage deletion to config by dropping stale triggers & removing stale data from Ably config table
        client.query(selDropQuery, (err, res) => {
          if (shouldAbort(err)) return;
          for (let i = 0; i < res.rows.length; i++) {
            const tableName = res.rows[i].tablename;
            const op = res.rows[i].operation;
            const dropTrigger = `DROP TRIGGER IF EXISTS ${tableName}_notify_${op} ON ${tableName};`;

            client.query(dropTrigger, (err, res) => {
              if (shouldAbort(err)) return;
            });
          }
          client.query(deleteQuery, (err, res) => {
            if (shouldAbort(err)) return;
          });
        });
      });

      // Commit the transaction
      client.query("COMMIT", (err) => {
        if (err) {
          console.error("Error committing transaction", err.stack);
        }
      });
    });
  });
};
