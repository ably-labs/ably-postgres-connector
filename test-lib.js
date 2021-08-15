const { postgresconnector } = require("./ts-proj/dist");
const test_lib = () => {
  postgresconnector("config/default.json");
};

test_lib();
