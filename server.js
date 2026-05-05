const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const rootDir = __dirname;
const productsFile = path.join(rootDir, "products.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const adminPassword = process.env.ADMIN_PASSWORD || "tanjim77";

const allowedImages = new Set([
  "Img/seedling.jpeg",
  "Img/small seedling.jpeg",
  "Img/grown seedling.jpeg",
  "Img/grown seedling2.jpeg",
  "Img/flower.jpeg",
  "Img/flowers2.jpeg",
  "Img/flower3.jpeg",
  "Img/backgrownd.jpeg",
  "Img/logo.jpeg"
]);

const allowedCategories = new Set(["seedling", "young", "flower", "seasonal"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const defaultProducts = [
  {
    id: "fresh-seedlings",
    name: "Fresh Seedlings",
    category: "seedling",
    image: "Img/seedling.jpeg",
    description: "Small healthy starts for vegetables, fruits, herbs, and mixed garden beds.",
    tags: ["Small size", "Fresh roots"],
    search: "fresh seedlings vegetable fruit herb small roots garden farm balcony",
    orderText: "Order Seedlings"
  },
  {
    id: "small-seedling-tray",
    name: "Small Seedling Tray",
    category: "seedling",
    image: "Img/small seedling.jpeg",
    description: "Compact nursery seedlings for balcony pots, small gardens, and quick seasonal planting.",
    tags: ["Tray stock", "Easy planting"],
    search: "small seedling tray compact nursery balcony pots garden seasonal planting",
    orderText: "Order Seedlings"
  },
  {
    id: "little-grown-plants",
    name: "Little-grown Plants",
    category: "young",
    image: "Img/grown seedling.jpeg",
    description: "Young plants with more growth than seedlings, but still easy to carry and plant.",
    tags: ["Young plants", "Not full trees"],
    search: "little-grown young plant sapling not full tree garden rooftop farm",
    orderText: "Order Plants"
  },
  {
    id: "healthy-young-saplings",
    name: "Healthy Young Saplings",
    category: "young",
    image: "Img/grown seedling2.jpeg",
    description: "Stronger young saplings for rooftops, farms, and home gardens that need a head start.",
    tags: ["Strong leaves", "Garden ready"],
    search: "healthy young saplings stronger leaves rooftop farm home garden head start",
    orderText: "Order Plants"
  },
  {
    id: "flowering-plants",
    name: "Flowering Plants",
    category: "flower",
    image: "Img/flower.jpeg",
    description: "Colorful flowering plants for entrances, balconies, rooftops, and visitor spaces.",
    tags: ["Colorful", "Decorative"],
    search: "flowers flowering plants colorful balcony rooftop entrance decoration garden",
    orderText: "Order Flowers"
  },
  {
    id: "bright-flower-pots",
    name: "Bright Flower Pots",
    category: "flower",
    image: "Img/flowers2.jpeg",
    description: "Ready flower pots for patios, front doors, walkways, and outdoor seating corners.",
    tags: ["Ready pots", "Outdoor color"],
    search: "bright flower pots patios front doors walkways outdoor seating color",
    orderText: "Order Flowers"
  },
  {
    id: "garden-flower-mix",
    name: "Garden Flower Mix",
    category: "flower",
    image: "Img/flower3.jpeg",
    description: "A mixed flower option for garden borders, visitor areas, and fresh decorative planting.",
    tags: ["Mixed flowers", "Garden border"],
    search: "garden flower mix mixed flowers border visitor areas decorative planting",
    orderText: "Order Flowers"
  },
  {
    id: "seasonal-nursery-stock",
    name: "Seasonal Nursery Stock",
    category: "seasonal",
    image: "Img/backgrownd.jpeg",
    description: "A seasonal collection from the nursery, selected from what is fresh and available now.",
    tags: ["Seasonal", "Fresh stock"],
    search: "seasonal nursery stock fresh available now collection seedlings plants flowers",
    orderText: "Ask Availability"
  }
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body is too large.");
    }
  }

  return body ? JSON.parse(body) : {};
}

async function readProducts() {
  try {
    const rawProducts = await fs.readFile(productsFile, "utf8");
    return JSON.parse(rawProducts);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeProducts(defaultProducts);
    return defaultProducts;
  }
}

async function writeProducts(products) {
  await fs.writeFile(productsFile, `${JSON.stringify(products, null, 2)}\n`);
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `product-${Date.now()}`;
}

function uniqueProductId(products, name) {
  const base = slugify(name);
  let id = base;
  let count = 2;

  while (products.some((product) => product.id === id)) {
    id = `${base}-${count}`;
    count += 1;
  }

  return id;
}

function requireAdmin(request, response) {
  if (request.headers["x-admin-password"] === adminPassword) {
    return true;
  }

  sendError(response, 401, "Wrong admin password.");
  return false;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => cleanText(tag, 32)).filter(Boolean).slice(0, 6);
}

function normalizeProduct(input, products) {
  const name = cleanText(input.name, 80);
  const description = cleanText(input.description, 240);
  const category = cleanText(input.category, 24);
  const image = cleanText(input.image, 120);
  const tags = normalizeTags(input.tags);

  if (!name || !description) {
    throw new Error("Product name and description are required.");
  }

  if (!allowedCategories.has(category)) {
    throw new Error("Product category is not allowed.");
  }

  if (!allowedImages.has(image)) {
    throw new Error("Product image is not allowed.");
  }

  return {
    id: uniqueProductId(products, name),
    name,
    category,
    image,
    description,
    tags,
    search: cleanText(`${name} ${description} ${category} ${tags.join(" ")}`, 600),
    orderText: cleanText(input.orderText, 40) || "Order Product"
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/products") {
    sendJson(response, 200, await readProducts());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(request);
    if (body.password === adminPassword) {
      sendJson(response, 200, { ok: true });
    } else {
      sendError(response, 401, "Wrong admin password.");
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/products") {
    if (!requireAdmin(request, response)) return true;
    const products = await readProducts();
    const product = normalizeProduct(await readBody(request), products);
    const updatedProducts = [product, ...products];
    await writeProducts(updatedProducts);
    sendJson(response, 201, updatedProducts);
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/products/")) {
    if (!requireAdmin(request, response)) return true;
    const productId = decodeURIComponent(url.pathname.replace("/api/products/", ""));
    const products = await readProducts();
    const updatedProducts = products.filter((product) => product.id !== productId);
    await writeProducts(updatedProducts);
    sendJson(response, 200, updatedProducts);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/products/reset") {
    if (!requireAdmin(request, response)) return true;
    await writeProducts(defaultProducts);
    sendJson(response, 200, defaultProducts);
    return true;
  }

  return false;
}

async function serveStatic(response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    sendError(response, 403, "Forbidden.");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const mimeType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": mimeType });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(response, 404, "Not found.");
      return;
    }

    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/") && await handleApi(request, response, url)) {
      return;
    }

    await serveStatic(response, url);
  } catch (error) {
    sendError(response, 500, error.message || "Server error.");
  }
});

server.listen(port, host, () => {
  console.log(`Paharpur Agro Tourism is running at http://${host}:${port}`);
});
