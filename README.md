## Streaming PostgresDB changes to millions of clients in realtime

The Ably-Postgres connector publishes a message on a given Ably channel whenever any operations (insert/update/delete) are executed on the tables of your PostgreSQL database.

You can setup the connector with the configuration details of your database, as well as the Ably app, including your API Key, channel names for various types of updates, etc.

Check out the [example config](config/default.json) for more info.

### Prerequisites

- PostgreSQL (tested on version 13)
- Ably account

### Installation

```sh
    npm install ably-postgres-connector --save
```

### Setup config

- Create `config/default.json` file (refer to the [example config](config/default.json)) and add your database and Ably account credentials as needed.

- If you don't already have a table, create one in your DB. For example, for a table named `users`:

```sql
    CREATE TABLE users (
        id integer,
        name text
    );
```

- Update the database & Ably credentials in the `config/default.json` file.

### Example usage

```javascript
    // test-lib.js
    const { Connector } = require("ably-postgres-connector");
const test_lib = () => {
  const ablyconnector = new Connector("config/default.json");
  // or with .env file 
  // const ablyconnector = new Connector("config/.env"); 
  ablyconnector.start();
};

test_lib();
```

### Running

```sh
    node test-lib.js
```

### Test

Visit your Ably dev console and connect to the channel `ably-users-added` (or whichever channel you specified in your config). Try performing various operations (insert, update, delete) on your table. For every change, you should see a new message in the specific channel(s).

### How to run from source

Follow the [Setup config](#Setup-config) step from above and then proceed with an option from below to test.

- Option 1 - Build the library

  - To build the library from source (which is published on npm) and allows you to provide a custom config path.

  ```
  cd ts-proj
  npm i
  npm run build
  cd ..
  node test-lib.js
  ```

- Option 2 - Running through `docker-compose`

  - Creates the docker image and takes care of setting up the Postgres DB as well.
  - Provides an example of how you can integrate this through Docker with your application.

  ```
  docker-compose run connector
  ```

### How does it work?

![Overall Flow Diagram](./ably-postgres-connector-2.png)

- The config file contains the details related to the tables you want to listen for data changes on and your Ably API key.
- Using that config file, the connector creates an Ably config table `ablycontroltable` to maintain the table to Ably channel mapping in the DB.

![Internal Flow Diagram](./ably-postgres-connector-1.png)

- The connector then creates a DB procedure/function which performs the [`pg_notify`](https://www.postgresql.org/docs/current/sql-notify.html) function that publishes data changes on a data channel.
- The connector then creates triggers for the table-operation combination specified in the config. The job of the trigger is to execute the procedure created above.
- The connector is listening for changes on that particular data channel using the [`LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html) feature. When it gets a notification it publishes the data on the appropriate Ably channel.
