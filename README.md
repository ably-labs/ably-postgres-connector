## ably-postgres-connector

The library publishes a message on an Ably channel when operations (insert/update/delete) are executed on tables in PostgreSQL database.

You need to specify the table name, operation and ably channel name where you want to be alerted, on trigger of the operation. Refer the [example config](config/default.json) for more info.

### Prerequisites

- PostgreSQL (tested on  version 13)
- Ably account (API Key )

### Example

In `config/default.json` add your DB, Ably credentials & ably channel, table you want to hear on updates for.

- Create a table in your DB let's say `users`.

```sql
CREATE TABLE users (
    id integer,
    name text
);
```

- Update the DB & Ably credentials in the `config/default.json` file, you don't need to change the ablychannel config part if you're using the `users` table.

- Running

    Running the JS implementation

    ```
    npm i
    node test.js
    ```

    Running the TS lib
    ```
    cd ts-proj
    npm i
    npm run build
    cd ..
    node test-lib.js
    ```

- Visit your Ably dev console and connect to the channel `ablyusersins` to see the result once we insert a record.

- To test it just make an insert into your DB through the SQL shell or other tab in the terminal.

```sql
INSERT INTO users VALUES (4, 'PostgreSQL talking through Ably!');
```

- Now see your Ably dev console where you connected to the channel you should be able to see the latest message there!

![Flow Diagram](./ably-postgres-connector.png)