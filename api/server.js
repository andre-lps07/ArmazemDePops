const express  = require('express');
const multer   = require('multer');
const { Pool } = require('pg');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function conectar(tentativas = 10) {
  for (let i = 0; i < tentativas; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Banco conectado');
      return;
    } catch {
      console.log(`⏳ Aguardando banco... (${i + 1}/${tentativas})`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Não foi possível conectar ao banco.');
}

const UPLOAD_DIR = '/app/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => {
    const nome = Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, nome);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas PDFs são permitidos.'));
  },
});

app.use(cors());
app.use(express.json());

function adminAuth(req, res, next) {
  const senha = req.headers['x-admin-password'];
  if (senha !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Senha de admin incorreta.' });
  }
  next();
}

// Lista todos os POPs
app.get('/pops', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, titulo, tamanho, criado_em FROM pops ORDER BY criado_em DESC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Download do PDF
app.get('/pops/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pops WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'POP não encontrado.' });

    const arquivo = path.join(UPLOAD_DIR, rows[0].arquivo);
    if (!fs.existsSync(arquivo)) return res.status(404).json({ erro: 'Arquivo não encontrado.' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].titulo}.pdf"`);
    fs.createReadStream(arquivo).pipe(res);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Upload novo POP (admin)
app.post('/pops', adminAuth, upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });

  const titulo = (req.body.titulo || '').trim();
  if (!titulo) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ erro: 'Título obrigatório.' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO pops (titulo, arquivo, tamanho) VALUES ($1, $2, $3) RETURNING id, titulo, tamanho, criado_em',
      [titulo, req.file.filename, req.file.size]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    fs.unlinkSync(req.file.path);
    res.status(500).json({ erro: e.message });
  }
});

// Deletar POP (admin)
app.delete('/pops/:id', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM pops WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'POP não encontrado.' });

    const arquivo = path.join(UPLOAD_DIR, rows[0].arquivo);
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

conectar().then(() => {
  app.listen(PORT, () => console.log(`🚀 API rodando na porta ${PORT}`));
}).catch(e => {
  console.error('❌ Falha fatal:', e.message);
  process.exit(1);
});