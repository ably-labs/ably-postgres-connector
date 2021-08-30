const { Connector } = require("../lib/dist");
const useWithEnvDockerCompose = () => {
  const ablyconnector = new Connector();
  ablyconnector.start();
};
useWithEnvDockerCompose();
