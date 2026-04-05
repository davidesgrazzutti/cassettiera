using System.Text.Json;
using System.Text.Json.Serialization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors();

// 🔹 LETTURA CONNECTION STRING (supporta sia postgres:// che formato classico)
string rawConnString =
    builder.Configuration.GetConnectionString("Postgres")
    ?? Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("Connection string 'Postgres' mancante.");


string connString = rawConnString;
string jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? builder.Configuration["Jwt:Secret"]
    ?? "change-me-in-render";

// 🔹 Conversione automatica se formato URL postgres://
if (rawConnString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
    rawConnString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
{
    var uri = new Uri(rawConnString);
    var userInfo = uri.UserInfo.Split(':', 2);

    var username = Uri.UnescapeDataString(userInfo[0]);
    var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";

    connString = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.Trim('/'),
        Username = username,
        Password = password,
        SslMode = Npgsql.SslMode.Require,
        TrustServerCertificate = true
    }.ConnectionString;
}

// 🔹 GET ALL
app.MapGet("/api/drawers", async () =>
{
    const string sql = """
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
        ORDER BY c.codice;
    """;

    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();

    await using var cmd = new NpgsqlCommand(sql, conn);
    await using var reader = await cmd.ExecuteReaderAsync();

    var result = new List<object>();

    while (await reader.ReadAsync())
    {
        var articoliJson = reader["articoli"]?.ToString() ?? "[]";
        var articoli = JsonSerializer.Deserialize<object>(articoliJson);

        result.Add(new
        {
            id = reader.GetInt32(reader.GetOrdinal("id")),
            cassetto = reader.GetString(reader.GetOrdinal("codice")),
            stato = reader.GetString(reader.GetOrdinal("stato")),
            ultimoAggiornamento = reader.GetDateTime(reader.GetOrdinal("ultimo_aggiornamento")),
            note = reader["note"]?.ToString() ?? "",
            articoli = articoli
        });
    }

    return Results.Ok(result);
});

// 🔹 AUTH LOGIN
app.MapPost("/api/auth/login", async (LoginInput body) =>
{
    var username = (body.Username ?? string.Empty).Trim();
    var password = body.Password ?? string.Empty;

    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        return Results.BadRequest(new { error = "Username e password sono obbligatori" });

    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();

    await using var cmd = new NpgsqlCommand("""
        SELECT id, username, password_hash, is_active
        FROM users
        WHERE LOWER(username) = LOWER(@username)
        LIMIT 1
    """, conn);

    cmd.Parameters.AddWithValue("username", username);
    await using var reader = await cmd.ExecuteReaderAsync();

    if (!await reader.ReadAsync())
        return Results.Unauthorized();

    var userId = reader.GetInt32(reader.GetOrdinal("id"));
    var dbUsername = reader.GetString(reader.GetOrdinal("username"));
    var passwordHash = reader.GetString(reader.GetOrdinal("password_hash"));
    var isActive = reader.GetBoolean(reader.GetOrdinal("is_active"));

    if (!isActive)
        return Results.StatusCode(StatusCodes.Status403Forbidden);

    var isPasswordValid = BCrypt.Net.BCrypt.Verify(password, passwordHash);
    if (!isPasswordValid)
        return Results.Unauthorized();

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var tokenDescriptor = new JwtSecurityToken(
        claims: new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.UniqueName, dbUsername)
        },
        expires: DateTime.UtcNow.AddHours(12),
        signingCredentials: credentials
    );

    var token = new JwtSecurityTokenHandler().WriteToken(tokenDescriptor);

    return Results.Ok(new
    {
        token,
        user = new
        {
            id = userId,
            username = dbUsername
        }
    });
});

// 🔹 GET BY ID
app.MapGet("/api/drawers/{id:int}", async (int id) =>
{
    const string sql = """
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
        WHERE c.id = @id
        GROUP BY c.id, c.codice, c.stato, c.ultimo_aggiornamento, c.note;
    """;

    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();

    await using var cmd = new NpgsqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("id", id);

    await using var reader = await cmd.ExecuteReaderAsync();

    if (!await reader.ReadAsync())
        return Results.NotFound(new { error = "Cassetto non trovato" });

    var articoliJson = reader["articoli"]?.ToString() ?? "[]";
    var articoli = JsonSerializer.Deserialize<object>(articoliJson);

    return Results.Ok(new
    {
        id = reader.GetInt32(reader.GetOrdinal("id")),
        cassetto = reader.GetString(reader.GetOrdinal("codice")),
        stato = reader.GetString(reader.GetOrdinal("stato")),
        ultimoAggiornamento = reader.GetDateTime(reader.GetOrdinal("ultimo_aggiornamento")),
        note = reader["note"]?.ToString() ?? "",
        articoli = articoli
    });
});

// 🔹 POST
app.MapPost("/api/drawers", async (DrawerInput body) =>
{
    var cassetto = body.Cassetto;
    var stato = body.Stato ?? "Vuoto";
    var note = body.Note ?? "";

    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();

    await using var cmd = new NpgsqlCommand("""
        INSERT INTO cassetti (codice, stato, note, ultimo_aggiornamento)
        VALUES (@codice, @stato, @note, NOW())
        RETURNING *;
    """, conn);

    cmd.Parameters.AddWithValue("codice", cassetto);
    cmd.Parameters.AddWithValue("stato", stato);
    cmd.Parameters.AddWithValue("note", note);

    await using var reader = await cmd.ExecuteReaderAsync();
    if (!await reader.ReadAsync())
        return Results.Problem("Errore nel recupero del cassetto creato");

    return Results.Created("", new
    {
        id = reader.GetInt32(reader.GetOrdinal("id")),
        codice = reader.GetString(reader.GetOrdinal("codice")),
        stato = reader.GetString(reader.GetOrdinal("stato")),
        note = reader["note"]?.ToString() ?? "",
        ultimo_aggiornamento = reader.GetDateTime(reader.GetOrdinal("ultimo_aggiornamento"))
    });
});

// 🔹 PUT
app.MapPut("/api/drawers/{id:int}", async (int id, DrawerUpdateInput body) =>
{
    var stato = body.Stato;
    var note = body.Note ?? "";
    var articoli = body.Articoli ?? new();

    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();
    await using var tx = await conn.BeginTransactionAsync();

    try
    {
        // Update cassetto
        await new NpgsqlCommand("""
            UPDATE cassetti SET stato=@stato, note=@note, ultimo_aggiornamento=NOW() WHERE id=@id
        """, conn, tx)
        {
            Parameters =
            {
                new("stato", stato),
                new("note", note),
                new("id", id)
            }
        }.ExecuteNonQueryAsync();

        // Delete articoli vecchi
        await new NpgsqlCommand("DELETE FROM articoli WHERE cassetto_id=@id", conn, tx)
        { Parameters = { new("id", id) } }.ExecuteNonQueryAsync();

        // Inserisci nuovi articoli
        foreach (var art in articoli)
        {
            var codiceBarre = art.CodiceBarre ?? "";
            var codiceInterno = art.CodiceInterno ?? "";
            var articolo = art.Articolo ?? "";
            var quantita = art.Quantita;
            var um = art.Um ?? "pz";
            var quantitaMinima = art.QuantitaMinima;
            var noteArt = art.Note ?? "";

            await new NpgsqlCommand("""
                INSERT INTO articoli (cassetto_id, codice_barre, codice_interno, articolo, quantita, um, quantita_minima, note)
                VALUES (@cassetto_id, @codice_barre, @codice_interno, @articolo, @quantita, @um, @quantita_minima, @note)
            """, conn, tx)
            {
                Parameters =
                {
                    new("cassetto_id", id),
                    new("codice_barre", codiceBarre),
                    new("codice_interno", codiceInterno),
                    new("articolo", articolo),
                    new("quantita", quantita),
                    new("um", um),
                    new("quantita_minima", quantitaMinima),
                    new("note", noteArt)
                }
            }.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return Results.Ok(new { message = "Cassetto aggiornato correttamente" });
    }
    catch (Exception ex)
    {
        await tx.RollbackAsync();
        return Results.Problem("Errore nel salvataggio del cassetto: " + ex.Message);
    }
});

// 🔹 DELETE
app.MapDelete("/api/drawers/{id:int}", async (int id) =>
{
    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();
    await using var tx = await conn.BeginTransactionAsync();

    try
    {
        await new NpgsqlCommand("DELETE FROM articoli WHERE cassetto_id=@id", conn, tx)
        { Parameters = { new("id", id) } }.ExecuteNonQueryAsync();

        await new NpgsqlCommand("DELETE FROM cassetti WHERE id=@id", conn, tx)
        { Parameters = { new("id", id) } }.ExecuteNonQueryAsync();

        await tx.CommitAsync();
        return Results.Ok(new { message = "Cassetto e articoli eliminati correttamente" });
    }
    catch
    {
        await tx.RollbackAsync();
        return Results.Problem("Errore nell'eliminazione del cassetto");
    }
});

// 🔹 SWAP
app.MapPost("/api/swap", async (SwapInput body) =>
{
    var id1 = body.Id1;
    var id2 = body.Id2;

    if (id1 == 0 || id2 == 0)
        return Results.BadRequest(new { error = "id1 e id2 sono obbligatori" });

    await using var conn = new NpgsqlConnection(connString);
    await conn.OpenAsync();
    await using var tx = await conn.BeginTransactionAsync();

    try
    {
        // Recupera i dati dei due cassetti
        var cmd1 = new NpgsqlCommand("SELECT * FROM cassetti WHERE id=@id", conn, tx);
        cmd1.Parameters.AddWithValue("id", id1);
        var reader1 = await cmd1.ExecuteReaderAsync();
        if (!await reader1.ReadAsync())
        {
            await tx.RollbackAsync();
            return Results.NotFound(new { error = "Uno o entrambi i cassetti non trovati" });
        }
        var drawer1Stato = reader1["stato"].ToString();
        var drawer1Note = reader1["note"].ToString() ?? "";
        reader1.Close();

        var cmd2 = new NpgsqlCommand("SELECT * FROM cassetti WHERE id=@id", conn, tx);
        cmd2.Parameters.AddWithValue("id", id2);
        var reader2 = await cmd2.ExecuteReaderAsync();
        if (!await reader2.ReadAsync())
        {
            await tx.RollbackAsync();
            return Results.NotFound(new { error = "Uno o entrambi i cassetti non trovati" });
        }
        var drawer2Stato = reader2["stato"].ToString();
        var drawer2Note = reader2["note"].ToString() ?? "";
        reader2.Close();

        // Recupera gli articoli
        var articles1List = new List<(string cb, string ci, string art, decimal q, string um, decimal qm, string n)>();
        var cmdArt1 = new NpgsqlCommand("SELECT * FROM articoli WHERE cassetto_id=@id", conn, tx);
        cmdArt1.Parameters.AddWithValue("id", id1);
        var readerArt1 = await cmdArt1.ExecuteReaderAsync();
        while (await readerArt1.ReadAsync())
        {
            articles1List.Add((
                readerArt1["codice_barre"].ToString() ?? "",
                readerArt1["codice_interno"].ToString() ?? "",
                readerArt1["articolo"].ToString() ?? "",
                (decimal)readerArt1["quantita"],
                readerArt1["um"].ToString() ?? "pz",
                (decimal)readerArt1["quantita_minima"],
                readerArt1["note"].ToString() ?? ""
            ));
        }
        readerArt1.Close();

        var articles2List = new List<(string cb, string ci, string art, decimal q, string um, decimal qm, string n)>();
        var cmdArt2 = new NpgsqlCommand("SELECT * FROM articoli WHERE cassetto_id=@id", conn, tx);
        cmdArt2.Parameters.AddWithValue("id", id2);
        var readerArt2 = await cmdArt2.ExecuteReaderAsync();
        while (await readerArt2.ReadAsync())
        {
            articles2List.Add((
                readerArt2["codice_barre"].ToString() ?? "",
                readerArt2["codice_interno"].ToString() ?? "",
                readerArt2["articolo"].ToString() ?? "",
                (decimal)readerArt2["quantita"],
                readerArt2["um"].ToString() ?? "pz",
                (decimal)readerArt2["quantita_minima"],
                readerArt2["note"].ToString() ?? ""
            ));
        }
        readerArt2.Close();

        // Scambia stato e note
        await new NpgsqlCommand(
            "UPDATE cassetti SET stato=@stato, note=@note, ultimo_aggiornamento=NOW() WHERE id=@id",
            conn, tx)
        {
            Parameters = { new("stato", drawer2Stato), new("note", drawer2Note), new("id", id1) }
        }.ExecuteNonQueryAsync();

        await new NpgsqlCommand(
            "UPDATE cassetti SET stato=@stato, note=@note, ultimo_aggiornamento=NOW() WHERE id=@id",
            conn, tx)
        {
            Parameters = { new("stato", drawer1Stato), new("note", drawer1Note), new("id", id2) }
        }.ExecuteNonQueryAsync();

        // Elimina gli articoli vecchi
        await new NpgsqlCommand("DELETE FROM articoli WHERE cassetto_id=@id", conn, tx)
        { Parameters = { new("id", id1) } }.ExecuteNonQueryAsync();

        await new NpgsqlCommand("DELETE FROM articoli WHERE cassetto_id=@id", conn, tx)
        { Parameters = { new("id", id2) } }.ExecuteNonQueryAsync();

        // Inserisci gli articoli scambiati
        foreach (var art in articles2List)
        {
            await new NpgsqlCommand("""
                INSERT INTO articoli (cassetto_id, codice_barre, codice_interno, articolo, quantita, um, quantita_minima, note)
                VALUES (@cid, @cb, @ci, @art, @q, @um, @qm, @n)
            """, conn, tx)
            {
                Parameters =
                {
                    new("cid", id1),
                    new("cb", art.cb),
                    new("ci", art.ci),
                    new("art", art.art),
                    new("q", art.q),
                    new("um", art.um),
                    new("qm", art.qm),
                    new("n", art.n)
                }
            }.ExecuteNonQueryAsync();
        }

        foreach (var art in articles1List)
        {
            await new NpgsqlCommand("""
                INSERT INTO articoli (cassetto_id, codice_barre, codice_interno, articolo, quantita, um, quantita_minima, note)
                VALUES (@cid, @cb, @ci, @art, @q, @um, @qm, @n)
            """, conn, tx)
            {
                Parameters =
                {
                    new("cid", id2),
                    new("cb", art.cb),
                    new("ci", art.ci),
                    new("art", art.art),
                    new("q", art.q),
                    new("um", art.um),
                    new("qm", art.qm),
                    new("n", art.n)
                }
            }.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return Results.Ok(new { message = "Cassetti scambiati correttamente" });
    }
    catch (Exception ex)
    {
        await tx.RollbackAsync();
        return Results.Problem("Errore nello scambio dei cassetti: " + ex.Message);
    }
});

app.Run();

// 🔹 MODELLI (dopo app.Run())
public class DrawerInput
{
    [JsonPropertyName("cassetto")]
    public string Cassetto { get; set; }
    
    [JsonPropertyName("stato")]
    public string? Stato { get; set; }
    
    [JsonPropertyName("note")]
    public string? Note { get; set; }
}

public class ArticoloInput
{
    [JsonPropertyName("codiceBarre")]
    public string? CodiceBarre { get; set; }
    
    [JsonPropertyName("codiceInterno")]
    public string? CodiceInterno { get; set; }
    
    [JsonPropertyName("articolo")]
    public string? Articolo { get; set; }
    
    [JsonPropertyName("quantita")]
    public decimal Quantita { get; set; }
    
    [JsonPropertyName("um")]
    public string? Um { get; set; }
    
    [JsonPropertyName("quantitaMinima")]
    public decimal QuantitaMinima { get; set; }
    
    [JsonPropertyName("note")]
    public string? Note { get; set; }
}

public class DrawerUpdateInput
{
    [JsonPropertyName("stato")]
    public string Stato { get; set; }
    
    [JsonPropertyName("note")]
    public string? Note { get; set; }
    
    [JsonPropertyName("articoli")]
    public List<ArticoloInput>? Articoli { get; set; }
}

public class SwapInput
{
    [JsonPropertyName("id1")]
    public int Id1 { get; set; }
    
    [JsonPropertyName("id2")]
    public int Id2 { get; set; }
}

public class LoginInput
{
    [JsonPropertyName("username")]
    public string? Username { get; set; }

    [JsonPropertyName("password")]
    public string? Password { get; set; }
}