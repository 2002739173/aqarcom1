# AqarCom — Postman collection

`AqarCom.postman_collection.json` covers **all 73 routes** of `server/src/routes` (127 requests, including the expected error cases).
Each request has tests and saves the tokens/IDs the following requests need, so run the collection **in order**.

## Before running
1. MongoDB is running, and `server/.env` is set up (copied from `.env.example`).
2. `cd server && npm run seed` (creates `admin@aqarcom.app` / `Passw0rd!`), or create an admin with `npm run create-admin -- <email> <password>` and update the `adminEmail` / `adminPassword` variables.
3. `npm run dev` (the server runs on `http://localhost:3000`).
4. The scoring service (FastAPI) is optional: if it isn't running, the server switches to its in-core evaluation engine.

## Run with Newman (the fastest way)
```bash
cd postman
npx newman run AqarCom.postman_collection.json --working-dir .
```

## Run in Postman
- Import → choose the collection file.
- Settings → General → **Working directory** = this `postman` folder (the upload files are in `fixtures/`).
- Open the Collection Runner and run all folders in order.

## Notes
- `tenderCloseSeconds` (default 60): tender A closes after this many seconds so the evaluation and award can be tested. If you run the requests manually one by one, raise it to 600 or more.
- The auth routes are limited to 100 requests per 15 minutes; each run uses about 17, so restart the server if you run the collection many times in a row.
- Change `baseUrl` if the server is on a different address.
- The password reset is tested with a wrong code (400). To test the success path, take the code from the server console after "Forgot password".
