const { Connector } = require("./ts-proj/dist");
const test_lib = () => {
  const ablyconnector = new Connector("config/default.json");
  ablyconnector.start();
};

test_lib();
