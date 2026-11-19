// Servidor Express: expone la API REST que consume el dashboard en React
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar } from './db.js';
import dashboard from './routes/dashboard.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.use('/api', dashboard);

// En producción, el mismo servidor entrega el frontend compilado (frontend/dist)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

// Manejo centralizado de errores
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
conectar()
  .then(() => app.listen(PORT, () => console.log(`API lista en http://localhost:${PORT}`)))
  .catch((e) => { console.error('No se pudo conectar a MongoDB:', e.message); process.exit(1); });
