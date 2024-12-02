# Anix API
Unofficial API of anix.to

## About
Unofficial API of [anix.to](https://anix.sh) using consumet api's library. This api also has a built in m3u8 proxy that can be used whenever needed.

## Installation
1. Clone the repository.
```bash
git clone https://github.com/hase0278/anix-api.git
```
2. Run `npm i`.
3. Run `npm run build`.
4. Run `npm start`.

You can configure how the proxy works via a `.env` file; it's relatively self-explanatory.
```
# This file is a template for .env file
# Copy this file to .env and change the values

# Web server configuration
PORT="3030"
```

## Instant deploy
Vercel
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hase0278/hase0278-m3u8-proxy)

## Usage
To proxy m3u8 files, use the `/m3u8-proxy` route. All you have to do is input the URL and headers. For example:
```
http://localhost:3030/m3u8-proxy?url=https%3A%2F%2Fs9xshtqmeip.cdn-jupiter.com%2Fhls2%2F01%2F04468%2Fa5if0xw4y98s_%2Cn%2Ch%2Cx%2C.urlset%2Findex-f3-v1-a1.m3u8%3Ft%3DWZmB_gQIZYtva6WUpQ7BOvNcT9HipPcBJjPqYiFEKRQ%26s%3D1722161453%26e%3D129600%26f%3D22342265%26srv%3Djs4BwLKgfmTMJmVh%26i%3D0.4%26sp%3D500%26p1%3Djs4BwLKgfmTMJmVh%26p2%3Djs4BwLKgfmTMJmVh%26asn%3D16509&headers=%7B%22referer%22%3A%22https%3A%2F%2Fawish.pro%2Fe%2Fa5if0xw4y98s%22%7D
```
The URL in this case is `https://www032.vipanicdn.net/streamhls/b9bf60933960deb9a5ddbc93adba8423/ep.4.1721922175.1080.m3u8` and the headers are `{"Referer": "https://s3taku.com"}`. This will then send a request to the m3u8 using the headers, modify the content to use the proxy, then proxy each ts file using a CORS proxy.

## Credit
Proxy uses the code from [this](https://github.com/hase0278/hase0278-m3u8-proxy) repository.
API uses the library from [consumet.ts](https://github.com/consumet/consumet.ts) master branch repository.