const { Connector } = require("ably-postgres-connector");
const useWithJSONConfig = () => {
  const ablyconnector = new Connector("../config/default.json");
  ablyconnector.start();
};
useWithJSONConfig();
