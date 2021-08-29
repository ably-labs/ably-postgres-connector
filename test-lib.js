const { Connector } = require("./ts-proj/dist");
const test_lib = () => {
  const ablyconnector = new Connector();
  ablyconnector.start();
};

test_lib();
