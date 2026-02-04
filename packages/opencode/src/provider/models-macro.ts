import {NodePolyFillBun} from "@/util/node-polyfill"
import modelDevResult from "./modelDev.ts"

export async function data() {
  const path = process.env.MODELS_DEV_API_JSON
  // const path = Bun.env.MODELS_DEV_API_JSON
  if (path) {
    const file = NodePolyFillBun.file(path)
    if (await file.exists()) {
      return await file.text()
    }
  }
  return modelDevResult;
}
