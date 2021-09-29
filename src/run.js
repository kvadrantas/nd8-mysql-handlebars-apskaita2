import express from "express";
import exphbs from "express-handlebars";
import { connect, end, query } from "./db.js";

const PORT = 3000;
const WEB = "web";

const app = express();

app.engine(
  "handlebars",
  exphbs({
    helpers: {
      dateFormat: (date) => {
        if (date instanceof Date) {
          let year = "0000" + date.getFullYear();
          year = year.substr(-4);
          let month = "00" + (date.getMonth() + 1);
          month = month.substr(-2);
          let day = "00" + date.getDate();
          day = day.substr(-2);
          return `${year}-${month}-${day}`;
        }
        return date;
      },
      eq: (param1, param2) => {
        return param1 === param2;
      },
    },
  }),
);
app.set("view engine", "handlebars");

app.use(express.static(WEB, {
  index: ["index.html"],
}));
app.use(express.urlencoded({
  extended: true,
}));

app.get("/cekiai", async (req, res) => {
  let conn;
  try {
    conn = await connect();
    const { results: cekiai } = await query(
      conn,
      `
    select
      id, data, parduotuve
    from cekiai
    order by
      data, parduotuve`,
    );
    res.render("cekiai", { cekiai });
  } catch (err) {
    res.render("klaida", { err });
  } finally {
    await end(conn);
  }
});

let parentCekisId;
app.get("/cekis/:id?", async (req, res) => {
  // tikrinam ar yra perduotas id parametras
  if (req.params.id) {
    const id = parseInt(req.params.id);
    parentCekisId = id;
    if (!isNaN(id)) {
      let conn;
      try {
        conn = await connect();
        const { results: cekiai } = await query(
          conn,
          `
          select
            id, data, parduotuve
          from cekiai
          where id = ?`,
          [id],
        );
        if (cekiai.length > 0) {
          // siame sarase yra VIENAS irasas (tas kurio mes ir ieskojom)
          // generuojam forma su tuo irasu
          const { results: prekes } = await query(
            conn,
            `
            select
              prekes.id, preke, kiekis, kaina, tipai.pavadinimas as tipas
            from prekes left join tipai on prekes.tipai_id = tipai.id
            where cekiai_id = ?`,
            [cekiai[0].id],
          );
          res.render("cekis", { cekis: cekiai[0], prekes });
        } else {
          // cekis su nurodytu id nerastas
          res.redirect("/cekiai");
        }
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      // padave id ne skaiciu - dabar siunciam i cekiu sarasa
      // o galim parodyt klaidos forma
      res.redirect("/cekiai");
    }
  } else {
    // Naujo cekio ivedimas
    res.render("cekis");
  }
});

app.post("/cekis", async (req, res) => {
  if (req.body.id) {
    // update esama ceki
    const id = parseInt(req.body.id);
    if (
      !isNaN(id) &&
      isFinite((new Date(req.body.data)).getTime()) &&
      typeof req.body.parduotuve === "string" &&
      req.body.parduotuve.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await query(
          conn,
          `
          update cekiai
          set data = ? , parduotuve = ?
          where id = ?`,
          [new Date(req.body.data), req.body.parduotuve, id],
        );
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else {
    // insert nauja ceki
    if (
      isFinite((new Date(req.body.data)).getTime()) &&
      typeof req.body.parduotuve === "string" &&
      req.body.parduotuve.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await query(
          conn,
          `
          insert into cekiai (data, parduotuve)
          values (?, ?)`,
          [new Date(req.body.data), req.body.parduotuve],
        );
      } catch (err) {
        // ivyko klaida irasant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  }
  res.redirect("/cekiai");
});

app.get("/cekis/:id/del", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isNaN(id)) {
    let conn;
    try {
      conn = await connect();
      await query(
        conn,
        `
          delete from cekiai
          where id = ?`,
        [id],
      );
    } catch (err) {
      // ivyko klaida gaunant duomenis
      res.render("klaida", { err });
      return;
    } finally {
      await end(conn);
    }
  }
  res.redirect("/cekiai");
});

app.get("/preke/:id?", async (req, res) => {
  // tikrinam ar yra perduotas id parametras
  if (req.params.id) {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      let conn;
      try {
        conn = await connect();
        const { results: prekes } = await query(
          conn,
          `
          select
            prekes.id, cekiai_id as cekisId, preke, kiekis, kaina, tipai_id as tipas
          from prekes
          where id = ?`,
          [id],
        );
        if (prekes.length > 0) {
          const { results: tipai } = await query(
            conn,
            `
          select
            id, pavadinimas
          from tipai
          order by
            pavadinimas`,
          );
          // siame sarase yra VIENAS irasas (tas kurio mes ir ieskojom)
          // generuojam forma su tuo irasu
          res.render("preke", { preke: prekes[0], tipai });
        } else {
          // preke su nurodytu id nerasta
          res.redirect("/cekiai");
        }
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      // padave id ne skaiciu - dabar siunciam i cekiu sarasa
      // o galim parodyt klaidos forma
      res.redirect("/cekiai");
    }
  } else if (req.query.cekisId) {
    const cekisId = parseInt(req.query.cekisId);
    if (!isNaN(cekisId)) {
      // Naujos prekes ivedimas
      let conn;
      try {
        conn = await connect();
        const { results: tipai } = await query(
          conn,
          `
        select
          id, pavadinimas
        from tipai
        order by
          pavadinimas`,
        );
        res.render("preke", { tipai, cekisId });
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      res.redirect("/cekiai");
    }
  }
});

//PREKES TRYNIMAS
app.get("/preke/:id/del", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isNaN(id)) {
    let conn;
    try {
      conn = await connect();
      await query(
        conn,
        `
          delete from prekes
          where id = ?`,
        [id],
      );
    } catch (err) {
      // ivyko klaida gaunant duomenis
      res.render("klaida", { err });
      return;
    } finally {
      await end(conn);
    }
  }
  res.redirect(`/cekis/${parentCekisId}`);
});

// PREKES REDAGAVIMAS ARBA NAUJOS PREKES ivedimas
app.post("/preke", async (req, res) => {
  const cekioId = parseInt(req.body.cekisId);
  const prekesId = parseInt(req.body.id);
  const kiekis = parseFloat(req.body.kiekis);
  const kaina = parseFloat(req.body.kaina);
  const tipas = parseInt(req.body.tipas);

  if (req.body.id) {
    // update esama preke
    if (
      !isNaN(prekesId) &&
      typeof req.body.preke === "string" &&
      req.body.preke.trim() !== ""  &&
      !isNaN(req.body.kiekis) &&
      !isNaN(req.body.kaina) &&
      !isNaN(req.body.tipas)
    ) {
      let conn;
      try {
        conn = await connect();
        await query(
          conn,
          `
          update prekes
          set 
          cekiai_id = ?,
          preke = ?,
          kiekis = ?,
          kaina = ?,
          tipai_id = ?
          where id = ?`,
          [cekioId, req.body.preke, kiekis, kaina, tipas, prekesId],
        );
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else {
    // insert nauja preke
    if (
      typeof req.body.preke === "string" &&
      req.body.preke.trim() !== "" &&
      !isNaN(req.body.kiekis) &&
      !isNaN(req.body.kaina) &&
      !isNaN(req.body.tipas)
    ) {
      let conn;
      try {
        conn = await connect();
        await query(
          conn,
          `
          insert into prekes (cekiai_id, preke, kiekis, kaina, tipai_id)
          values (?, ?, ?, ?, ?)`,
          [cekioId, req.body.preke, kiekis, kaina, tipas, prekesId],
        );
      } catch (err) {
        // ivyko klaida irasant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  }
  res.redirect(`/cekis/${cekioId}`);
});
// ----------------------------------------------

app.get("/tipai", async (req, res) => {
  let conn;
  try {
    conn = await connect();
    const { results: tipai } = await query(
      conn,
      `
    select
      id, pavadinimas
    from tipai
    order by
      pavadinimas`,
    );
    res.render("tipai", { tipai });
  } catch (err) {
    res.render("klaida", { err });
  } finally {
    await end(conn);
  }
});

app.get("/tipas/:id?", async (req, res) => {
  // tikrinam ar yra perduotas id parametras
  if (req.params.id) {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      let conn;
      try {
        conn = await connect();
        const { results: tipai } = await query(
          conn,
          `
          select
            id, pavadinimas
          from tipai
          where id = ?`,
          [id],
        );
        if (tipai.length > 0) {
          // siame sarase yra VIENAS irasas (tas kurio mes ir ieskojom)
          // generuojam forma su tuo irasu
          res.render("tipas", { tipas: tipai[0] });
        } else {
          // tipas su nurodytu id nerastas
          res.redirect("/tipai");
        }
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      // padave id ne skaiciu - dabar siunciam i tipu sarasa
      // o galim parodyt klaidos forma
      res.redirect("/tipai");
    }
  } else {
    // Naujo tipo ivedimas
    res.render("tipas");
  }
});

app.post("/tipas", async (req, res) => {
  if (req.body.id) {
    // update esama tipa
    const id = parseInt(req.body.id);
    if (
      !isNaN(id) &&
      typeof req.body.pavadinimas === "string" &&
      req.body.pavadinimas.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await query(
          conn,
          `
          update tipai
          set pavadinimas = ?
          where id = ?`,
          [req.body.pavadinimas, id],
        );
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else {
    // insert nauja tipa
    if (
      typeof req.body.pavadinimas === "string" &&
      req.body.pavadinimas.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await query(
          conn,
          `
          insert into tipai (pavadinimas)
          values (?)`,
          [req.body.pavadinimas],
        );
      } catch (err) {
        // ivyko klaida irasant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  }
  res.redirect("/tipai");
});

app.get("/tipas/:id/del", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isNaN(id)) {
    let conn;
    try {
      conn = await connect();
      await query(
        conn,
        `
          delete from tipai
          where id = ?`,
        [id],
      );
    } catch (err) {
      // ivyko klaida gaunant duomenis
      res.render("klaida", { err });
      return;
    } finally {
      await end(conn);
    }
  }
  res.redirect("/tipai");
});

app.listen(PORT, () => {
  console.log(`Apskaita app listening at http://localhost:${PORT}`);
});
