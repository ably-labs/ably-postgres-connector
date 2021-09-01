const { Connector } = require("ably-postgres-connector");
const useWithEnvConfig = () => {
  const ablyconnector = new Connector("../config/.env");
  ablyconnector.start();
};
useWithEnvConfig();
