import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { serve } from "./media";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ handler: serve, method: "GET", pathPrefix: "/media/" });

export default http;
