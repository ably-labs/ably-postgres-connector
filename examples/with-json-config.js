const { Connector } = require("../lib/dist");
const useWithJSONConfig = () => {
    const ablyconnector = new Connector("config/default.json");
    ablyconnector.start();
};
useWithJSONConfig();
