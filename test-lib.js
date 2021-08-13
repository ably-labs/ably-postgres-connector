const { postgresconnector } = require("./ts-proj/dist");
const test_async = () => {
  postgresconnector("config/default.json");
};

test_async();
