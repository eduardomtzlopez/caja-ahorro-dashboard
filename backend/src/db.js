// Conexión única a la base analítica que llena el ETL
import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const cliente = new MongoClient(uri);
let db;

export async function conectar() {
  await cliente.connect();
  db = cliente.db(process.env.DB_ANALITICA || 'caja_ahorro_analitica');
  console.log(`MongoDB conectado: ${db.databaseName}`);
  return db;
}

export const col = (nombre) => db.collection(nombre);
