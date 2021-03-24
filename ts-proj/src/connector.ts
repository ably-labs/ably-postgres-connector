const { Client } = require("pg");
const Ably = require('ably');
const fs = require('fs');

let ably, client, connector;

const setup = async (filepath: string) => {
    let rawdata = fs.readFileSync(filepath);
    let config = JSON.parse(rawdata);
    const dbConfig = config['dbConfig'];
    connector = config['connector'];
    const ablyOptions = config['ably'];

    ably = new Ably.Realtime(ablyOptions.apiKey);

    client = new Client(dbConfig);
    await client
        .connect()
    try {
        await client.query('LISTEN "table_update"'); // both working "table_update" or table_update
        client.on("notification", function (data) {
            if (data.channel === "table_update") {
                const notifyData = JSON.parse(data.payload)
                const operation = notifyData.type
                const tableName = notifyData.table
                const getAblyChannel = `Select ablychannelname from ablycontroltable where tablename='${tableName}' and operation='${operation}'`;
                client.query(getAblyChannel, (err, res) => {
                    if (err) {
                        console.log(err.stack)
                    } else {
                        if (res.rows.length != 0) {
                            const channel = ably.channels.get(res.rows[0].ablychannelname);
                            channel.publish('Yo postgres connector here, hola!', data.payload);
                        } else {
                            console.log("no such config subscribed to!")
                        }

                    }
                })
            }
        });
    } catch (err) {
        console.log(err.stack)
    }

}

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
    await setup(filepath);
    client.query("BEGIN", (err) => {
        if (shouldAbort(err)) return;

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
            const createCtrlTable = `CREATE TABLE IF NOT EXISTS ablycontroltable(tablename VARCHAR(100) NOT NULL, ablychannelname VARCHAR(100) NOT NULL, operation VARCHAR(50), 
        PRIMARY KEY(tablename, ablychannelname, operation));`
            client.query(createCtrlTable, (err, res) => {
                if (shouldAbort(err)) return

                let deleteQuery = `Delete from ablycontroltable where tablename not in (select tablename from users where `
                let selDropQuery = `Select * from ablycontroltable where tablename not in (select tablename from users where `
                let commonQueryPart = ``

                for (let i = 0; i < connector.length; i++) {
                    const tableName = connector[i].tablename;
                    const op = connector[i].operation;
                    const ablyChannel = connector[i].ablychannelname;
                    if (i == 0) {
                        commonQueryPart += `(tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}')`
                    } else {
                        commonQueryPart += ` or (tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}')`
                    }
                    let queryCtrlTable = `SELECT * from ablycontroltable where tablename='${tableName}' and ablychannelname='${ablyChannel}' and operation='${op}'`;
                    client.query(queryCtrlTable, (err, res) => {
                        if (shouldAbort(err)) return
                        
                        if (res.rows.length == 0) {
                            const insertData = 'INSERT INTO ablycontroltable(tablename, ablychannelname, operation) VALUES($1, $2, $3) RETURNING *'
                            const values = [tableName, ablyChannel, op]

                            // callback
                            client.query(insertData, values, (err, res) => {
                                if (err) {
                                    console.log(err.stack)
                                }
                                const createTrigger = `CREATE TRIGGER ${tableName}_notify_${op} AFTER ${op} ON ${tableName} FOR EACH ROW EXECUTE PROCEDURE ably_notify();`
                                client.query(createTrigger, (err, res) => {
                                    if (err) {
                                        console.log(err.stack)
                                    }
                                })
                            })
                        }
                    })
                }
                commonQueryPart += ');'
                deleteQuery += commonQueryPart
                selDropQuery += commonQueryPart

                client.query(selDropQuery, (err, res) => {
                    if (shouldAbort(err)) return
                    for (let i = 0; i < res.rows.length; i++) {
                        const tableName = res.rows[i].tablename;
                        const op = res.rows[i].operation;
                        const dropTrigger = `DROP TRIGGER IF EXISTS ${tableName}_notify_${op} ON ${tableName};`

                        client.query(dropTrigger, (err, res) => {
                            if (shouldAbort(err)) return
                        })
                    }
                    client.query(deleteQuery, (err, res) => {
                        if (shouldAbort(err)) return
                    });
                });
            });

            client.query("COMMIT", (err) => {
                if (err) {
                    console.error("Error committing transaction", err.stack);
                }
            });
        });
    })
}
