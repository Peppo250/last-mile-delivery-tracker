import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`Last-Mile Delivery Tracker API listening on port ${env.port} [${env.nodeEnv}]`);
});
