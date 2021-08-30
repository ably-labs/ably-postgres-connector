const { Connector } = require("../lib/dist");
const useWithEnvConfig = () => {
  const ablyconnector = new Connector("config/.env");
  ablyconnector.start();
};
useWithEnvConfig();
