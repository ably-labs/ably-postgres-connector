## Streaming PostgresDB changes to millions of clients in realtime

The Ably-Postgres connector publishes a message on a given Ably channel whenever any operations (insert/update/delete) are executed on the tables of your PostgreSQL database.

You can setup the connector with the configuration details of your database, as well as the Ably app, including your API Key, channel names for various types of updates, etc.

Check out the [example config](config/default.json) for more info.

### Prerequisites

- [PostgreSQL](https://www.postgresql.org/) (this project was tested on version 13)
- [An Ably account](https://ably.com/)

### Installation

```sh
    npm install ably-postgres-connector --save
```

### Setup config

- The first step is to add in your configuration. You can do this via env file or a JSON file.

#### Option 1 - Adding config via a JSON file

- Create `config/default.json` file (refer to the [example JSON config](config/default.json)).
- Add your database and Ably account credentials as needed.

##### Example usage

```javascript
    const { Connector } = require("ably-postgres-connector");
    const useWithJSONConfig = () => {
        const ablyconnector = new Connector("config/default.json");
    };

    useWithJSONConfig();
```

##### Running

```sh
    node examples/with-json-config.js
```

#### Option 2 - Adding config via a env file

- Create `config/.env` file (refer to the [example env config](config/.env)).
- Add your database and Ably account credentials as needed.

##### Example usage

```javascript
    const { Connector } = require("ably-postgres-connector");
    const useWithEnvConfig = () => {
        const ablyconnector = new Connector("config/.env");
    };

    useWithEnvConfig();
```

##### Running (Using the example file)

```sh
    node examples/with-env-config.js
```

#### Option 3 - Adding config via a env file through docker-compose

- Create `config/.env` file (refer to the [example env config](config/.env)).
- Add your database and Ably account credentials as needed.
- Add path of `.env` file to your `docker-compose` file (refer to the [example docker-compose](docker-compose.yml)).

##### Example usage

```javascript
    const { Connector } = require("ably-postgres-connector");
    const useWithEnvDockerCompose = () => {
        const ablyconnector = new Connector();
    };

    useWithEnvDockerCompose();
```

```yaml
    # connector-block
    connector:
      build:
        context: .
      env_file: ./config/.env
      depends_on:
        - db
      ports:
        - "3000:3000"
```

##### Running (Using the example docker-compose file)

- Uses the `Docker` folder to setup the postgresql image with a dummy DB & users table. 
- Uses the `Dockerfile` to create the container with node, build the connector & add the config file.

```sh
    docker-compose run connector
```

### Connector in Action!

Visit your Ably dev console and connect to the channel `ably-users-added` (or whichever channel you specified in your config). Try performing various operations (insert, update, delete) on your table. For every change, you should see a new message in the specific channel(s).

## How does the connector work?

<img width="1252" alt="ably-to-db-postgres@2x (3)" src="https://user-images.githubusercontent.com/5900152/131161607-cf4ff6d9-f6d6-45c9-9a3e-caa9d26a8b51.png">


- The config file contains the details related to the tables you want to listen for data changes on and your Ably API key.
- Using that config file, the connector creates an Ably config table `ablycontroltable` to maintain the table to Ably channel mapping in the DB.
- The connector then creates a DB procedure/function which performs the [`pg_notify`](https://www.postgresql.org/docs/current/sql-notify.html) function that publishes data changes on a data channel.
- The connector then creates triggers for the table-operation combination specified in the config. The job of the trigger is to execute the procedure created above.
- The connector is listening for changes on that particular data channel using the [`LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html) feature. When it gets a notification it publishes the data on the appropriate Ably channel.
