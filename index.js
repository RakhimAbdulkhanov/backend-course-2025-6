const { program } = require('commander');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

program
  .requiredOption('-h, --host <host>', 'server host')
  .requiredOption('-p, --port <port>', 'server port')
  .requiredOption('-c, --cache <path>', 'path to cache directory');

program.parse();

const { host, port, cache } = program.opts();

if (!fs.existsSync(cache)) {
  fs.mkdirSync(cache, { recursive: true });
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, cache),
  filename: (req, file, cb) => cb(null, `${uuidv4()}.jpg`),
});
const upload = multer({ storage });

const inventory = {};

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API для сервісу інвентаризації',
    },
    servers: [{ url: `http://${host}:${port}` }],
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Форма реєстрації інвентарю
 *     responses:
 *       200:
 *         description: HTML форма реєстрації
 */
app.get('/RegisterForm.html', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'RegisterForm.html'));
});

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Форма пошуку інвентарю
 *     responses:
 *       200:
 *         description: HTML форма пошуку
 */
app.get('/SearchForm.html', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'SearchForm.html'));
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нової речі
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Річ зареєстрована успішно
 *       400:
 *         description: Відсутнє ім'я речі
 */
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name) {
    return res.status(400).send('Bad Request: inventory_name is required');
  }

  const id = uuidv4();
  const photoPath = req.file ? req.file.filename : null;

  inventory[id] = {
    id,
    inventory_name,
    description: description || '',
    photo: photoPath,
  };

  res.status(201).json({ id, inventory_name, description });
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати список всіх речей
 *     responses:
 *       200:
 *         description: Список всіх речей
 */
app.get('/inventory', (req, res) => {
  const list = Object.values(inventory).map((item) => ({
    ...item,
    photoUrl: item.photo ? `http://${host}:${port}/inventory/${item.id}/photo` : null,
  }));
  res.status(200).json(list);
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати інформацію про конкретну річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Інформація про річ
 *       404:
 *         description: Річ не знайдена
 */
app.get('/inventory/:id', (req, res) => {
  const item = inventory[req.params.id];
  if (!item) return res.status(404).send('Not Found');

  res.status(200).json({
    ...item,
    photoUrl: item.photo ? `http://${host}:${port}/inventory/${item.id}/photo` : null,
  });
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити ім'я або опис речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Річ оновлена
 *       404:
 *         description: Річ не знайдена
 */
app.put('/inventory/:id', (req, res) => {
  const item = inventory[req.params.id];
  if (!item) return res.status(404).send('Not Found');

  const { inventory_name, description } = req.body;
  if (inventory_name) item.inventory_name = inventory_name;
  if (description !== undefined) item.description = description;

  res.status(200).json(item);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Фото речі
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Річ або фото не знайдено
 */
app.get('/inventory/:id/photo', (req, res) => {
  const item = inventory[req.params.id];
  if (!item || !item.photo) return res.status(404).send('Not Found');

  const photoPath = path.join(cache, item.photo);
  if (!fs.existsSync(photoPath)) return res.status(404).send('Not Found');

  res.setHeader('Content-Type', 'image/jpeg');
  res.status(200).sendFile(path.resolve(photoPath));
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Річ не знайдена
 */
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const item = inventory[req.params.id];
  if (!item) return res.status(404).send('Not Found');

  if (item.photo) {
    const oldPath = path.join(cache, item.photo);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  item.photo = req.file ? req.file.filename : null;
  res.status(200).json({ message: 'Photo updated' });
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Річ видалена
 *       404:
 *         description: Річ не знайдена
 */
app.delete('/inventory/:id', (req, res) => {
  const item = inventory[req.params.id];
  if (!item) return res.status(404).send('Not Found');

  if (item.photo) {
    const photoPath = path.join(cache, item.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }

  delete inventory[req.params.id];
  res.status(200).send('Deleted');
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук речі за ID
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               includePhoto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Інформація про знайдену річ
 *       404:
 *         description: Річ не знайдена
 */
app.post('/search', (req, res) => {
  const { id, includePhoto } = req.body;
  const item = inventory[id];
  if (!item) return res.status(404).send('Not Found');

  const result = { ...item };
  if (includePhoto === 'on' || includePhoto === 'true') {
    result.photoUrl = item.photo
      ? `http://${host}:${port}/inventory/${item.id}/photo`
      : null;
  }

  res.status(200).json(result);
});

app.use((req, res) => {
  res.status(405).send('Method Not Allowed');
});

app.listen(parseInt(port), host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(`Swagger docs: http://${host}:${port}/api-docs`);
});