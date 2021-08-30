const { Connector } = require("../lib/dist");
const test_lib = () => {
  const ablyconnector = new Connector();
  ablyconnector.start();
};

test_lib();
