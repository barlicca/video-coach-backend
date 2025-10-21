import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "sessions";
    const paramsToSign = { timestamp, folder, resource_type: "video" };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.status(200).json({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      resource_type: "video",
      signature,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "sign-error", details: e.message });
  }
}
