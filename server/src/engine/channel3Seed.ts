import type { Sku } from "../types.js";

// Verified Channel3 live catalog search results cached across all brief line items.
// Bundled so cold starts on Vercel never fall back to fixtures even if Channel3 API limits or latencies hit.
export const CHANNEL3_SEED_CACHE: Record<string, Sku[]> = {
  "24-port PoE switch": [
    {
      "id": "xbon9g2",
      "title": "Ubiquiti Pro Max 24 PoE, 24-Port Layer 3 PoE Switch",
      "brand": "Ubiquiti",
      "price": 1160.06,
      "merchant": "newegg.com",
      "imageUrl": "https://cdn.trychannel3.com/5ca26762-d495-466d-8454-ea952c3cc8b0?aid=01M78C0JW929PVXR9JH4BMBJ0T&mid=LPzf",
      "url": "https://buy.trychannel3.com/xbon9g2-LPzf-5sZrP1?o=01M63FVEZQKFZ8MR1JEPKY1ZW6&aid=01M78C0JW929PVXR9JH4BMBJ0T",
      "source": "channel3"
    },
    {
      "id": "1DG46UJ",
      "title": "Ubiquiti Standard 24 PoE, 24-Port Layer 2 PoE Switch",
      "brand": "Ubiquiti",
      "price": 424.99,
      "merchant": "newegg.com",
      "imageUrl": "https://cdn.trychannel3.com/a43f1eb8-0d55-4fed-9380-66081f471a47?aid=01M78C0JW929PVXR9JH4BMBJ0T&mid=LPzf",
      "url": "https://buy.trychannel3.com/1DG46UJ-LPzf-5sZrP1?o=01M636MP84X088MYTJHW81RNQM&aid=01M78C0JW929PVXR9JH4BMBJ0T",
      "source": "channel3"
    },
    {
      "id": "URWxA2O",
      "title": "Cisco SG500X-24P-K9-NA 24-port PoE managed switch with 4 uplinks",
      "brand": "Cisco",
      "price": 995,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/6f60fdde-cf03-42ca-a763-109da6b43b64?aid=01M78C0JW929PVXR9JH4BMBJ0T&mid=p1PB",
      "url": "https://buy.trychannel3.com/URWxA2O-p1PB-5sZrP1?o=01M3ZSYTNC6BHCA7BDW4SGG59A&aid=01M78C0JW929PVXR9JH4BMBJ0T",
      "source": "channel3"
    },
    {
      "id": "ndUzoRw",
      "title": "Cisco Consumer Products Catalyst 9200 24-port PoE+ Switch",
      "brand": "Cisco Consumer Products",
      "price": 2302.8,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/8b289118-5e94-4efb-944e-071353dcdfd6?aid=01M78C0JW929PVXR9JH4BMBJ0T&mid=p1PB",
      "url": "https://buy.trychannel3.com/ndUzoRw-p1PB-5sZrP1?o=01KY4CRGP2T5FPQQES1Q2MDPEN&aid=01M78C0JW929PVXR9JH4BMBJ0T",
      "source": "channel3"
    },
    {
      "id": "o62qAia",
      "title": "TRENDnet TPE-TG240G 24-Port Gigabit PoE+ Switch",
      "brand": "TRENDnet",
      "price": 345.99,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/691a441d-d1f2-49e9-9228-e6b5140c2818?aid=01M78C0JW929PVXR9JH4BMBJ0T&mid=oHaU",
      "url": "https://buy.trychannel3.com/o62qAia-oHaU-5sZrP1?o=01M4005XBD569CXJPT64MXVKW2&aid=01M78C0JW929PVXR9JH4BMBJ0T",
      "source": "channel3"
    },
    {
      "id": "MA5ep8Q",
      "title": "NETGEAR 24-Port PoE Smart Switch",
      "brand": "NETGEAR",
      "price": 73.97,
      "merchant": "microcenter.com",
      "imageUrl": "https://cdn.trychannel3.com/a6ff7549-c30e-4ee5-b861-7a413344fb86?aid=01M78C0JW929PVXR9JH4BMBJ0T&mid=yqJJ",
      "url": "https://buy.trychannel3.com/MA5ep8Q-yqJJ-5sZrP1?o=01M3YKYZQWTGNBF10J55CGMQJR&aid=01M78C0JW929PVXR9JH4BMBJ0T",
      "source": "channel3"
    }
  ],
  "height-adjustable desks": [
    {
      "id": "cHTgNnz",
      "title": "Humanscale Sit Stand Height Adjustable & Standing Desk",
      "brand": "Humanscale",
      "price": 562.5,
      "merchant": "luxedecor.com",
      "imageUrl": "https://cdn.trychannel3.com/d0099d85-da3f-4f91-8ae5-87c59de34c38?aid=01M78C0JMCVF631TPXHCY2QMDP&mid=lCZ3",
      "url": "https://buy.trychannel3.com/cHTgNnz-lCZ3-5sZrP1?o=01M313VG329B33D8HBV0ZNXMKR&aid=01M78C0JMCVF631TPXHCY2QMDP",
      "source": "channel3"
    },
    {
      "id": "bPTMEKP",
      "title": "Furniture of America Tilah Metal Height Adjustable Office Desk",
      "brand": "Furniture of America",
      "price": 312.82,
      "merchant": "cymax.com",
      "imageUrl": "https://cdn.trychannel3.com/bbc713c6-8ffa-45ba-84be-d188c27a320d?aid=01M78C0JMCVF631TPXHCY2QMDP&mid=RSVV",
      "url": "https://buy.trychannel3.com/bPTMEKP-RSVV-5sZrP1?o=01M71HZMPRWTN852V57QJDN5XK&aid=01M78C0JMCVF631TPXHCY2QMDP",
      "source": "channel3"
    },
    {
      "id": "Yt9Fjxp",
      "title": "Humanscale Sit Stand Bamboo Height Adjustable & Standing Desk",
      "brand": "Humanscale",
      "price": 562.5,
      "merchant": "luxedecor.com",
      "imageUrl": "https://cdn.trychannel3.com/2873e69e-79a6-4159-a86d-5800c875e36f?aid=01M78C0JMCVF631TPXHCY2QMDP&mid=lCZ3",
      "url": "https://buy.trychannel3.com/Yt9Fjxp-lCZ3-5sZrP1?o=01M32158S30TFFKTH4ZN5285Y7&aid=01M78C0JMCVF631TPXHCY2QMDP",
      "source": "channel3"
    },
    {
      "id": "3iB4J9j",
      "title": "WELLFOR Height Adjustable Sit Stand Computer Desk With 2 Drawers & Hanging Hooks",
      "brand": "WELLFOR",
      "price": 219.99,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/37b8d1c6-6a0c-4e4e-a42a-5665b9bd4c10?aid=01M78C0JMCVF631TPXHCY2QMDP&mid=p1PB",
      "url": "https://buy.trychannel3.com/3iB4J9j-p1PB-5sZrP1?o=01KZ7QY5CJR6J4PHX66FHYE0RB&aid=01M78C0JMCVF631TPXHCY2QMDP",
      "source": "channel3"
    },
    {
      "id": "pzTcCTC",
      "title": "Alera Sit-to-Stand Table Desk - Modern Walnut Finish, Adjustable Height 47.25\" x 23.63\"",
      "brand": "Alera",
      "price": 439.99,
      "merchant": "tractorsupply.com",
      "imageUrl": "https://cdn.trychannel3.com/c0db2ea3-3d1f-4b95-82fa-2a215d3339c4?aid=01M78C0JMCVF631TPXHCY2QMDP&mid=7Nxp",
      "url": "https://buy.trychannel3.com/pzTcCTC-7Nxp-5sZrP1?o=01M4X4RQFKS6H6YHFZPX1998AR&aid=01M78C0JMCVF631TPXHCY2QMDP",
      "source": "channel3"
    },
    {
      "id": "u3gI6DI",
      "title": "Poppin Series L 2S Adj Ht Sgl Desk",
      "brand": "Poppin",
      "price": 599,
      "merchant": "wayfair.com",
      "imageUrl": "https://cdn.trychannel3.com/205ca35b-d4e4-4c6b-bda0-f05b2eb74527?aid=01M78C0JMCVF631TPXHCY2QMDP&mid=BIP9",
      "url": "https://buy.trychannel3.com/u3gI6DI-BIP9-5sZrP1?o=01M4YJTC0AY83F2EYVEANP7A51&aid=01M78C0JMCVF631TPXHCY2QMDP",
      "source": "channel3"
    }
  ],
  "conference room displays": [
    {
      "id": "owmjI4e",
      "title": "Dell 55\" 4K Conference Room Monitor - P5525QC",
      "brand": "Dell",
      "price": 1456.99,
      "merchant": "cdw.com",
      "imageUrl": "https://cdn.trychannel3.com/93c521e9-d4cc-4217-a38b-9dfe7f41cd62?aid=01M78C0JQ9KJM0YQE0P7DEWGYH&mid=TgS4",
      "url": "https://buy.trychannel3.com/owmjI4e-TgS4-5sZrP1?o=01M3YX42KQ22YBJQMB96FX9CYY&aid=01M78C0JQ9KJM0YQE0P7DEWGYH",
      "source": "channel3"
    },
    {
      "id": "lJ9JKv1",
      "title": "ViewSonic CDE8630-MTR 86\" 4K Digital Display Conferencing System",
      "brand": "ViewSonic",
      "price": 3598,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/324433cc-768c-495f-bc2f-da4a36530848?aid=01M78C0JQ9KJM0YQE0P7DEWGYH&mid=oHaU",
      "url": "https://buy.trychannel3.com/lJ9JKv1-oHaU-5sZrP1?o=01M3N49QYK0P8DNB54SJ9SE6VK&aid=01M78C0JQ9KJM0YQE0P7DEWGYH",
      "source": "channel3"
    },
    {
      "id": "QH4d3VV",
      "title": "ViewSonic CDE6530-MTRC 65\" 4K Digital Display Conferencing System",
      "brand": "ViewSonic",
      "price": 2288,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/f24fd315-3e15-4759-a638-7d674acc5daf?aid=01M78C0JQ9KJM0YQE0P7DEWGYH&mid=oHaU",
      "url": "https://buy.trychannel3.com/QH4d3VV-oHaU-5sZrP1?o=01M3PRKBRTA2S6J98SS72M9Q2S&aid=01M78C0JQ9KJM0YQE0P7DEWGYH",
      "source": "channel3"
    },
    {
      "id": "eofBXs2",
      "title": "ViewSonic CDE5530-MTR 55\" 4K Digital Display Conferencing System",
      "brand": "ViewSonic",
      "price": 1948,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/5f2b0d92-0168-43e4-b7d8-f62a909782e0?aid=01M78C0JQ9KJM0YQE0P7DEWGYH&mid=oHaU",
      "url": "https://buy.trychannel3.com/eofBXs2-oHaU-5sZrP1?o=01M3E5BTVG6VRGK86T6NADVF39&aid=01M78C0JQ9KJM0YQE0P7DEWGYH",
      "source": "channel3"
    },
    {
      "id": "gM7cyCS",
      "title": "Sharp InfinityBoard IB654Q-2.1 4K UHD Touchscreen IPS LED Display",
      "brand": "SHARP",
      "price": 12999,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/ce115756-6568-4676-873c-1b42c43d8a44?aid=01M78C0JQ9KJM0YQE0P7DEWGYH&mid=oHaU",
      "url": "https://buy.trychannel3.com/gM7cyCS-oHaU-5sZrP1?o=01M39SB72F3T493H69HH32D7QK&aid=01M78C0JQ9KJM0YQE0P7DEWGYH",
      "source": "channel3"
    },
    {
      "id": "tBYLR6Q",
      "title": "Microsoft Surface Hub 3 85\" 4K IPS LCD Touch Display",
      "brand": "Microsoft",
      "price": 9499.99,
      "merchant": "microsoft.com",
      "imageUrl": "https://cdn.trychannel3.com/652505d9-8ba8-4cb1-994e-aed66dfdc6ea?aid=01M78C0JQ9KJM0YQE0P7DEWGYH&mid=63Gk",
      "url": "https://buy.trychannel3.com/tBYLR6Q-63Gk-5sZrP1?o=01M40VFT0JXS2H8VHSPYA41PVP&aid=01M78C0JQ9KJM0YQE0P7DEWGYH",
      "source": "channel3"
    }
  ],
  "rack UPS battery backup": [
    {
      "id": "EXd7UAQ",
      "title": "APC Smart UPS with SmartConnect Rack Mount UPS Battery Backup",
      "brand": "APC",
      "price": 922.99,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/78abeda2-eee4-402c-9ec3-2de541515079?aid=01M78C0JQVXSFHQX2JHZMQECPR&mid=p1PB",
      "url": "https://buy.trychannel3.com/EXd7UAQ-p1PB-5sZrP1?o=01KY7AKFX0RB3R946S7ZT1MCTN&aid=01M78C0JQVXSFHQX2JHZMQECPR",
      "source": "channel3"
    },
    {
      "id": "kF5RYhe",
      "title": "APC Smart-UPS, SMC1000-2UC 2U Rack Back-UPS, 1000 VA Backup Battery Power Supply",
      "brand": "APC",
      "price": 669,
      "merchant": "newegg.com",
      "imageUrl": "https://cdn.trychannel3.com/ba9a6003-cc01-4007-a1a9-a30cb117cd03?aid=01M78C0JQVXSFHQX2JHZMQECPR&mid=LPzf",
      "url": "https://buy.trychannel3.com/kF5RYhe-LPzf-5sZrP1?o=01M406BSE6WWF5R1GJ7JE8G83F&aid=01M78C0JQVXSFHQX2JHZMQECPR",
      "source": "channel3"
    },
    {
      "id": "t0uYZQS",
      "title": "CyberPower Line-Interactive 1U Rackmount UPS Battery Backup",
      "brand": "CyberPower",
      "price": 1131.06,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/bbd57c90-98d7-4116-a068-870d2a276575?aid=01M78C0JQVXSFHQX2JHZMQECPR&mid=p1PB",
      "url": "https://buy.trychannel3.com/t0uYZQS-p1PB-5sZrP1?o=01M73WHX5SEH439QEAYYJSB4BS&aid=01M78C0JQVXSFHQX2JHZMQECPR",
      "source": "channel3"
    },
    {
      "id": "vA7seWD",
      "title": "CyberPower UPS Battery Backup and Surge Protector",
      "brand": "CyberPower",
      "price": 329.95,
      "merchant": "lenovo.com",
      "imageUrl": "https://cdn.trychannel3.com/46a340c5-a20b-423a-aa07-c1848a71aaa9?aid=01M78C0JQVXSFHQX2JHZMQECPR&mid=hl1t",
      "url": "https://buy.trychannel3.com/vA7seWD-hl1t-5sZrP1?o=01KR7XTPAZRREZ6ZTZD9YK8ZSK&aid=01M78C0JQVXSFHQX2JHZMQECPR",
      "source": "channel3"
    },
    {
      "id": "XnWFOtF",
      "title": "APC UPS Battery Backup",
      "brand": "APC",
      "price": 79.99,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/faca57e6-8141-40f4-8fa6-6b735fbb19e5?aid=01M78C0JQVXSFHQX2JHZMQECPR&mid=p1PB",
      "url": "https://buy.trychannel3.com/XnWFOtF-p1PB-5sZrP1?o=01KYQHZVGXTTDFRYZ4T8T81NTB&aid=01M78C0JQVXSFHQX2JHZMQECPR",
      "source": "channel3"
    },
    {
      "id": "rwfft6y",
      "title": "APC UPS Battery Backup",
      "brand": "APC",
      "price": 123.99,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/61b8e8c5-05fd-4c59-8660-067277d5e343?aid=01M78C0JQVXSFHQX2JHZMQECPR&mid=oHaU",
      "url": "https://buy.trychannel3.com/rwfft6y-oHaU-5sZrP1?o=01M3T1RKY2A9TNR7RKTG9H77KR&aid=01M78C0JQVXSFHQX2JHZMQECPR",
      "source": "channel3"
    }
  ],
  "wifi 7 access points": [
    {
      "id": "CeYdcLy",
      "title": "TP-Link EAP773 BE11000 Tri-Band Wi-Fi 7 Access Point",
      "brand": "TP-Link",
      "price": 198.15,
      "merchant": "newegg.com",
      "imageUrl": "https://cdn.trychannel3.com/c479ed9a-5a02-466b-ba35-d9186cff9785?aid=01M78C0JS6M1QRBHEXZ70VVZQ3&mid=LPzf",
      "url": "https://buy.trychannel3.com/CeYdcLy-LPzf-5sZrP1?o=01M6BVCP6ZN3635ABJM7X93N5S&aid=01M78C0JS6M1QRBHEXZ70VVZQ3",
      "source": "channel3"
    },
    {
      "id": "U8sg9el",
      "title": "Ubiquiti Networks U7 Long Range WiFi 7 Access Point (U7-LR)",
      "brand": "Ubiquiti",
      "price": 175,
      "merchant": "newegg.com",
      "imageUrl": "https://cdn.trychannel3.com/5f11ccce-973b-4136-a5c5-ce9b10e57b47?aid=01M78C0JS6M1QRBHEXZ70VVZQ3&mid=LPzf",
      "url": "https://buy.trychannel3.com/U8sg9el-LPzf-5sZrP1?o=01M5TTRD1FBVAQKNCJ3PM0YESX&aid=01M78C0JS6M1QRBHEXZ70VVZQ3",
      "source": "channel3"
    },
    {
      "id": "svhhyg0",
      "title": "Ubiquiti UniFi U7 Pro Access Point - WiFi 7 Tri-Band",
      "brand": "Ubiquiti",
      "price": 203.99,
      "merchant": "microcenter.com",
      "imageUrl": "https://cdn.trychannel3.com/decba1e3-cd78-49b8-877c-cea1e7c5e758?aid=01M78C0JS6M1QRBHEXZ70VVZQ3&mid=yqJJ",
      "url": "https://buy.trychannel3.com/svhhyg0-yqJJ-5sZrP1?o=01M47QQJBAB429GXEPS3HF9E7N&aid=01M78C0JS6M1QRBHEXZ70VVZQ3",
      "source": "channel3"
    },
    {
      "id": "3HAYbe4",
      "title": "Ubiquiti U7 Mesh Compact Indoor/Outdoor WiFi 7 Access Point",
      "brand": "Ubiquiti",
      "price": 219.99,
      "merchant": "microcenter.com",
      "imageUrl": "https://cdn.trychannel3.com/790244ec-a53e-45af-814d-7cf850a62594?aid=01M78C0JS6M1QRBHEXZ70VVZQ3&mid=yqJJ",
      "url": "https://buy.trychannel3.com/3HAYbe4-yqJJ-5sZrP1?o=01M6581HZBCV468KQ7QNK6HTGS&aid=01M78C0JS6M1QRBHEXZ70VVZQ3",
      "source": "channel3"
    },
    {
      "id": "vhhdnFO",
      "title": "TP-Link Omada EAP770 BE11000 Tri Band Wi-Fi 7 Wireless Access Point",
      "brand": "TP-Link",
      "price": 199.99,
      "merchant": "bhphotovideo.com",
      "imageUrl": "https://cdn.trychannel3.com/a459fed4-70d7-48ab-88ad-e9635b72619e?aid=01M78C0JS6M1QRBHEXZ70VVZQ3&mid=oHaU",
      "url": "https://buy.trychannel3.com/vhhdnFO-oHaU-5sZrP1?o=01M3K5EY9W134RG81XS53EK5G2&aid=01M78C0JS6M1QRBHEXZ70VVZQ3",
      "source": "channel3"
    },
    {
      "id": "deceyXW",
      "title": "HP Aruba Networking AP-734 Tri Band Wi-Fi 7 Indoor / Outdoor Wireless Access Point",
      "brand": "HP",
      "price": 1613.99,
      "merchant": "newegg.com",
      "imageUrl": "https://cdn.trychannel3.com/7ebc2900-5542-4467-9263-d05f4125c1a8?aid=01M78C0JS6M1QRBHEXZ70VVZQ3&mid=LPzf",
      "url": "https://buy.trychannel3.com/deceyXW-LPzf-5sZrP1?o=01KBPA9G9QRWX09ZBAF3R54Q4R&aid=01M78C0JS6M1QRBHEXZ70VVZQ3",
      "source": "channel3"
    }
  ],
  "ergonomic task chairs": [
    {
      "id": "q7AGtyH",
      "title": "Branch Ergonomic Task Chair Pro",
      "brand": "Branch",
      "price": 500.65,
      "merchant": "lumens.com",
      "imageUrl": "https://cdn.trychannel3.com/c21cf194-6f9e-4768-a2f2-b8cd85e4ce4f?aid=01M78C0JTXE00MYAFEMHPXPA67&mid=B0QI",
      "url": "https://buy.trychannel3.com/q7AGtyH-B0QI-5sZrP1?o=01M4S5WMYNW3JJJH58SPNKF6BW&aid=01M78C0JTXE00MYAFEMHPXPA67",
      "source": "channel3"
    },
    {
      "id": "PO89gBM",
      "title": "Serta Cosset Ergonomic Task Chair",
      "brand": "Serta",
      "price": 226.35,
      "merchant": "staples.com",
      "imageUrl": "https://cdn.trychannel3.com/2d74fe2c-52dc-4b04-bf81-82983df4d903?aid=01M78C0JTXE00MYAFEMHPXPA67&mid=LFnL",
      "url": "https://buy.trychannel3.com/PO89gBM-LFnL-5sZrP1?o=01KPBWNECZS3YB48652VET72GY&aid=01M78C0JTXE00MYAFEMHPXPA67",
      "source": "channel3"
    },
    {
      "id": "hF7khvb",
      "title": "KERDOM Ergonomic Task Chair",
      "brand": "KERDOM",
      "price": 181.48,
      "merchant": "homedepot.com",
      "imageUrl": "https://cdn.trychannel3.com/82ffe08c-0076-4561-be2c-66a84697616e?aid=01M78C0JTXE00MYAFEMHPXPA67&mid=FP7n",
      "url": "https://buy.trychannel3.com/hF7khvb-FP7n-5sZrP1?o=01M1MRAQH82B6PMJQN8WV9M11Z&aid=01M78C0JTXE00MYAFEMHPXPA67",
      "source": "channel3"
    },
    {
      "id": "uh3XJSd",
      "title": "La-Z-Boy Noelin Ergonomic Fabric Swivel Task Chair",
      "brand": "La-Z-Boy",
      "price": 389.99,
      "merchant": "staples.com",
      "imageUrl": "https://cdn.trychannel3.com/a54b397a-a501-4134-b869-06dcfb35e615?aid=01M78C0JTXE00MYAFEMHPXPA67&mid=LFnL",
      "url": "https://buy.trychannel3.com/uh3XJSd-LFnL-5sZrP1?o=01KZ5PE2ND6981W0DPSHBQNDD7&aid=01M78C0JTXE00MYAFEMHPXPA67",
      "source": "channel3"
    },
    {
      "id": "OQcuJrf",
      "title": "BOSS Perfect Posture Deluxe Ergonomic Fabric Mid-Back Office Task Chair",
      "brand": "BOSS",
      "price": 129.99,
      "merchant": "officedepot.com",
      "imageUrl": "https://cdn.trychannel3.com/a65add43-a7a5-4867-aa0f-7fa23eb17f3f?aid=01M78C0JTXE00MYAFEMHPXPA67&mid=6Uzl",
      "url": "https://buy.trychannel3.com/OQcuJrf-6Uzl-5sZrP1?o=01KBPCXGFRH0K8F1KVTMESQZP6&aid=01M78C0JTXE00MYAFEMHPXPA67",
      "source": "channel3"
    },
    {
      "id": "ZG5YMWP",
      "title": "Emma + Oliver Mid-Back Leather Multifunction Swivel Ergonomic Task Office Chair with Adjustable Arms",
      "brand": "Emma + Oliver",
      "price": 246.99,
      "merchant": "bestbuy.com",
      "imageUrl": "https://cdn.trychannel3.com/cfe5a614-4ebf-4347-92f3-7354c5a2fdf8?aid=01M78C0JTXE00MYAFEMHPXPA67&mid=p1PB",
      "url": "https://buy.trychannel3.com/ZG5YMWP-p1PB-5sZrP1?o=01M3ZVY9DSYSEY961DWR3X0RTW&aid=01M78C0JTXE00MYAFEMHPXPA67",
      "source": "channel3"
    }
  ]
};
