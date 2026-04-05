const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

function mapDrawer(row) {
  return {
    id: row.id,
    cassetto: row.codice,
    stato: row.stato,
    ultimoAggiornamento: row.ultimo_aggiornamento,
    note: row.note || "",
    articoli: Array.isArray(row.articoli) ? row.articoli : [],
  };
}

app.get("/api/drawers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.codice,
        c.stato,
        c.ultimo_aggiornamento,
        c.note,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'codiceBarre', a.codice_barre,
              'codiceInterno', a.codice_interno,
              'articolo', a.articolo,
              'quantita', a.quantita,
              'um', a.um,
              'quantitaMinima', a.quantita_minima,
              'note', a.note
            )
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'::json
        ) AS articoli
      FROM cassetti c
      LEFT JOIN articoli a ON a.cassetto_id = c.id
      GROUP BY c.id, c.codice, c.stato, c.ultimo_aggiornamento, c.note
      ORDER BY c.codice
    `);

    const mapped = result.rows.map((row) => ({
      id: row.id,
      cassetto: row.codice,
      stato: row.stato,
      ultimoAggiornamento: row.ultimo_aggiornamento,
      note: row.note || "",
      articoli: Array.isArray(row.articoli) ? row.articoli : [],
    }));

    res.json(mapped);
  } catch (error) {
    console.error("ERRORE API /api/drawers:", error);
    res.status(500).json({
      error: "Errore nel recupero dei cassetti",
      details: error.message,
    });
  }
});

app.get("/api/drawers/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.codice,
        c.stato,
        c.ultimo_aggiornamento,
        c.note,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'codiceBarre', a.codice_barre,
              'codiceInterno', a.codice_interno,
              'articolo', a.articolo,
              'quantita', a.quantita,
              'um', a.um,
              'quantitaMinima', a.quantita_minima,
              'note', a.note
            )
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'::json
        ) AS articoli
      FROM cassetti c
      LEFT JOIN articoli a ON a.cassetto_id = c.id
      WHERE c.id = $1
      GROUP BY c.id, c.codice, c.stato, c.ultimo_aggiornamento, c.note
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cassetto non trovato" });
    }

    const row = result.rows[0];

    res.json({
      id: row.id,
      cassetto: row.codice,
      stato: row.stato,
      ultimoAggiornamento: row.ultimo_aggiornamento,
      note: row.note || "",
      articoli: Array.isArray(row.articoli) ? row.articoli : [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Errore nel recupero del cassetto",
      details: error.message,
    });
  }
});

app.post("/api/drawers", async (req, res) => {
  const { cassetto, stato, note } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO cassetti (codice, stato, note, ultimo_aggiornamento)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
      `,
      [cassetto, stato || "Vuoto", note || ""]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Errore nella creazione del cassetto" });
  }
});

app.put("/api/drawers/:id", async (req, res) => {
  const { id } = req.params;
  const { stato, note, articoli } = req.body;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE cassetti
      SET stato = $1,
          note = $2,
          ultimo_aggiornamento = NOW()
      WHERE id = $3
      `,
      [stato, note || "", id]
    );

    await client.query(`DELETE FROM articoli WHERE cassetto_id = $1`, [id]);

    if (Array.isArray(articoli) && articoli.length > 0) {
      for (const articolo of articoli) {
        await client.query(
          `
          INSERT INTO articoli (
            cassetto_id,
            codice_barre,
            codice_interno,
            articolo,
            quantita,
            um,
            quantita_minima,
            note
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            id,
            articolo.codiceBarre || "",
            articolo.codiceInterno || "",
            articolo.articolo || "",
            Number(articolo.quantita) || 0,
            articolo.um || "pz",
            Number(articolo.quantitaMinima) || 0,
            articolo.note || "",
          ]
        );
      }
    }

    await client.query("COMMIT");

    res.json({ message: "Cassetto aggiornato correttamente" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Errore nel salvataggio del cassetto" });
  } finally {
    client.release();
  }
});

app.delete("/api/drawers/:id", async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Elimina gli articoli del cassetto
    await client.query(`DELETE FROM articoli WHERE cassetto_id = $1`, [id]);

    // Elimina il cassetto
    await client.query(`DELETE FROM cassetti WHERE id = $1`, [id]);

    await client.query("COMMIT");

    res.json({ message: "Cassetto e articoli eliminati correttamente" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Errore nell'eliminazione del cassetto" });
  } finally {
    client.release();
  }
});

app.post("/api/swap", async (req, res) => {
  const { id1, id2 } = req.body;

  if (!id1 || !id2) {
    return res.status(400).json({ error: "id1 e id2 sono obbligatori" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Recupera i dati dei due cassetti
    const drawer1Result = await client.query(
      `SELECT * FROM cassetti WHERE id = $1`,
      [id1]
    );
    const drawer2Result = await client.query(
      `SELECT * FROM cassetti WHERE id = $1`,
      [id2]
    );

    if (drawer1Result.rows.length === 0 || drawer2Result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Uno o entrambi i cassetti non trovati" });
    }

    const drawer1 = drawer1Result.rows[0];
    const drawer2 = drawer2Result.rows[0];

    // Recupera gli articoli per entrambi i cassetti
    const articles1 = await client.query(
      `SELECT * FROM articoli WHERE cassetto_id = $1`,
      [id1]
    );
    const articles2 = await client.query(
      `SELECT * FROM articoli WHERE cassetto_id = $1`,
      [id2]
    );

    // Scambia stato e note
    await client.query(
      `UPDATE cassetti SET stato = $1, note = $2, ultimo_aggiornamento = NOW() WHERE id = $3`,
      [drawer2.stato, drawer2.note, id1]
    );
    await client.query(
      `UPDATE cassetti SET stato = $1, note = $2, ultimo_aggiornamento = NOW() WHERE id = $3`,
      [drawer1.stato, drawer1.note, id2]
    );

    // Elimina gli articoli vecchi
    await client.query(`DELETE FROM articoli WHERE cassetto_id = $1`, [id1]);
    await client.query(`DELETE FROM articoli WHERE cassetto_id = $1`, [id2]);

    // Inserisci gli articoli scambiati
    for (const articolo of articles2.rows) {
      await client.query(
        `INSERT INTO articoli (
          cassetto_id,
          codice_barre,
          codice_interno,
          articolo,
          quantita,
          um,
          quantita_minima,
          note
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id1,
          articolo.codice_barre,
          articolo.codice_interno,
          articolo.articolo,
          articolo.quantita,
          articolo.um,
          articolo.quantita_minima,
          articolo.note,
        ]
      );
    }

    for (const articolo of articles1.rows) {
      await client.query(
        `INSERT INTO articoli (
          cassetto_id,
          codice_barre,
          codice_interno,
          articolo,
          quantita,
          um,
          quantita_minima,
          note
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id2,
          articolo.codice_barre,
          articolo.codice_interno,
          articolo.articolo,
          articolo.quantita,
          articolo.um,
          articolo.quantita_minima,
          articolo.note,
        ]
      );
    }

    await client.query("COMMIT");

    res.json({ message: "Cassetti scambiati correttamente" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Errore nello scambio dei cassetti" });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});