import * as Ably from "ably";
import { Client, ClientConfig } from "pg";
const dotenv = require("dotenv");
const fs = require("fs");

export class Connector {
  private readonly ably: Ably.Rest;
  private readonly ablyApiKey: string;
  private readonly pgClient: Client;
  private readonly pgConfig: ClientConfig;
  private readonly connector: any;
  private readonly fileext: string;

  constructor(filepath: string) {
    if (filepath) {
      this.fileext = filepath.split(".").pop();
    } else {
      this.fileext = "";
    }

    if (this.fileext == "json") {
      const rawdata = fs.readFileSync(filepath);
      const config = JSON.parse(rawdata);
      this.pgConfig = config["dbConfig"];
      this.connector = config["connector"];
      this.ablyApiKey = config["ably"].apiKey;
    } else if (this.fileext == "env" || this.fileext == "") {
      if (this.fileext == "env") {
        dotenv.config({ path: filepath });
      }
      const {
        DB_HOST,
        DB_PORT,
        DB_USER,
        DB_PASSWORD,
        DB_NAME,
        ABLY_API_KEY,
        ABLY_CONNECTOR,
      } = process.env;
      this.pgConfig = {
        user: DB_USER,
        port: +DB_PORT,
        password: DB_PASSWORD,
        database: DB_NAME,
        host: DB_HOST,
      };
      this.ablyApiKey = ABLY_API_KEY;
      this.connector = JSON.parse(ABLY_CONNECTOR);
    } else {
      console.error("Invalid config");
      return;
    }
    // instantiate Ably
    this.ably = new Ably.Rest(this.ablyApiKey);

    // instantiate node-postgresconnector client
    this.pgClient = new Client(this.pgConfig);
  }

  public start = async () => {
    // Setup Ably postgresconnector
    await this.setup();
    this.pgClient.query("BEGIN", (err) => {
      if (this.shouldAbort(err)) return;

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
      this.pgClient.query(queryText, (err, res) => {
        if (this.shouldAbort(err)) return;

        // Create Ably config table, to maintain table-to-ablychannel mapping
        const createCtrlTable = `CREATE TABLE IF NOT EXISTS ablycontroltable(tablename VARCHAR(100) NOT NULL, ablychannelname VARCHAR(100) NOT NULL, operation VARCHAR(50), 
        PRIMARY KEY(tablename, ablychannelname, operation));`;
        this.pgClient.query(createCtrlTable, (err, res) => {
          if (this.shouldAbort(err)) return;

          let deleteQuery = `Delete from ablycontroltable where not (`;
          let selDropQuery = `Select * from ablycontroltable where not (`;
          let commonQueryPart = ``;

          for (let i = 0; i < this.connector.length; i++) {
            const tableName = this.connector[i].tablename;
            const op = this.connector[i].operation;
            const ablyChannel = this.connector[i].ablychannelname;
            if (i == 0) {
              commonQueryPart += `(tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}')`;
            } else {
              commonQueryPart += ` or (tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}')`;
            }
            let queryCtrlTable = `SELECT * from ablycontroltable where tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}'`;
            this.pgClient.query(queryCtrlTable, (err, res) => {
              if (this.shouldAbort(err)) return;

              if (res.rows.length == 0) {
                const insertData =
                  "INSERT INTO ablycontroltable(tablename, ablychannelname, operation) VALUES($1, $2, $3) RETURNING *";
                const values = [tableName, ablyChannel, op];

                // Insert mapping into the Ably config table
                this.pgClient.query(insertData, values, (err, res) => {
                  if (err) {
                    console.log(err.stack);
                  }

                  // Create trigger for the particular table & DB operation combination
                  const createTrigger = `CREATE TRIGGER ${tableName}_notify_${op} AFTER ${op} ON ${tableName} FOR EACH ROW EXECUTE PROCEDURE ably_notify();`;
                  this.pgClient.query(createTrigger, (err, res) => {
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
          this.pgClient.query(selDropQuery, (err, res) => {
            if (this.shouldAbort(err)) return;
            for (let i = 0; i < res.rows.length; i++) {
              const tableName = res.rows[i].tablename;
              const op = res.rows[i].operation;
              const dropTrigger = `DROP TRIGGER IF EXISTS ${tableName}_notify_${op} ON ${tableName};`;

              this.pgClient.query(dropTrigger, (err, res) => {
                if (this.shouldAbort(err)) return;
              });
            }
            this.pgClient.query(deleteQuery, (err, res) => {
              if (this.shouldAbort(err)) return;
              console.log("Connected!");
            });
          });
        });

        // Commit the transaction
        this.pgClient.query("COMMIT", (err) => {
          if (err) {
            console.error("Error committing transaction", err.stack);
          }
        });
      });
    });
  };

  private setup = async () => {
    await this.pgClient.connect();

    try {
      // listen on a particular data channel
      await this.pgClient.query('LISTEN "table_update"');
      // on trigger of notification by pg_notify
      this.pgClient.on("notification", (data) => {
        if (data.channel === "table_update") {
          const notifyData = JSON.parse(data.payload);
          const operation = notifyData.type;
          const tableName = notifyData.table;
          const queryGetAblyChannelName = `Select ablychannelname from ablycontroltable where tablename='${tableName}' and operation='${operation}'`;

          // get the ably channel to publish data change on
          this.pgClient.query(queryGetAblyChannelName, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              if (res.rows.length != 0) {
                const channel = this.ably.channels.get(
                  res.rows[0].ablychannelname
                );

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
  private shouldAbort = (err) => {
    if (err) {
      console.error("Error in transaction", err.stack);
      this.pgClient.query("ROLLBACK", (err) => {
        if (err) {
          console.error("Error rolling back client", err.stack);
        }
      });
    }
    return !!err;
  };
}
