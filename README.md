# ⚙️ Anvriksh: Agentic AI Engine (Backend)

The core execution engine and API for the Anvriksh Sovereign AI Platform.

---

## 🏗️ Tech Stack
- **Node.js** (v20+)
- **TypeScript**
- **Express.js**
- **MongoDB** (Mongoose)
- **Groq SDK** (Neural Reasoning)

---

## 🚀 Deployment (Render)
1. **Root Directory:** `./` (or blank if in a standalone repo)
2. **Build Command:** `npm install && npm run build`
3. **Start Command:** `npm start`
4. **Environment Variables:**
   - `MONGODB_URI`: Your MongoDB connection string.
   - `JWT_SECRET`: A secure string for session signing.
   - `GROQ_API_KEY`: Your Groq Cloud API key.

---

## 🛠️ Development
- `npm run dev`: Starts the server with nodemon.
- `npm run build`: Compiles TypeScript to the `dist` folder.
- `npm start`: Runs the compiled JavaScript.
