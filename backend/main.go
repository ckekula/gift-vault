package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func newID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ── Models ────────────────────────────────────────────────────────────────────

type ListResponse struct {
	ID          string            `json:"id"`
	Blobs       map[string]string `json:"blobs"`
	KeyHandles  map[string]string `json:"key_handles"`
	ClaimStates map[string]string `json:"claim_states"`
	Version     int               `json:"version"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

type CreateListRequest struct {
	Blobs      map[string]string `json:"blobs"`
	KeyHandles map[string]string `json:"key_handles"`
}

type UpdateListRequest struct {
	Blobs      map[string]string `json:"blobs"`
	KeyHandles map[string]string `json:"key_handles"`
}

type ClaimRequest struct {
	GiftID string `json:"gift_id"`
	Claim  bool   `json:"claim"`
}

// ── Database ──────────────────────────────────────────────────────────────────

type DB struct {
	db *sql.DB
}

const schema = `
CREATE TABLE IF NOT EXISTS lists (
	id           TEXT PRIMARY KEY,
	blobs        TEXT NOT NULL DEFAULT '{}',
	key_handles  TEXT NOT NULL DEFAULT '{}',
	claim_states TEXT NOT NULL DEFAULT '{}',
	version      INTEGER NOT NULL DEFAULT 1,
	created_at   DATETIME NOT NULL,
	updated_at   DATETIME NOT NULL
);
`

func openDB(path string) (*DB, error) {
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite is single-writer; WAL handles concurrent reads
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return &DB{db: db}, nil
}

// marshalMap encodes a map to JSON string for storage.
func marshalMap(m map[string]string) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// unmarshalMap decodes a JSON string back to a map.
func unmarshalMap(s string) map[string]string {
	m := map[string]string{}
	if s == "" {
		return m
	}
	json.Unmarshal([]byte(s), &m)
	return m
}

func (d *DB) scanList(row *sql.Row) (*ListResponse, error) {
	var (
		id, blobsJSON, keyHandlesJSON, claimStatesJSON string
		version                                        int
		createdAt, updatedAt                           time.Time
	)
	err := row.Scan(&id, &blobsJSON, &keyHandlesJSON, &claimStatesJSON, &version, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	return &ListResponse{
		ID:          id,
		Blobs:       unmarshalMap(blobsJSON),
		KeyHandles:  unmarshalMap(keyHandlesJSON),
		ClaimStates: unmarshalMap(claimStatesJSON),
		Version:     version,
		UpdatedAt:   updatedAt,
	}, nil
}

func (d *DB) Create(req CreateListRequest) (*ListResponse, error) {
	id := newID()
	now := time.Now().UTC()
	_, err := d.db.Exec(
		`INSERT INTO lists (id, blobs, key_handles, claim_states, version, created_at, updated_at)
		 VALUES (?, ?, ?, '{}', 1, ?, ?)`,
		id, marshalMap(req.Blobs), marshalMap(req.KeyHandles), now, now,
	)
	if err != nil {
		return nil, err
	}
	return d.Get(id)
}

func (d *DB) Get(id string) (*ListResponse, error) {
	row := d.db.QueryRow(
		`SELECT id, blobs, key_handles, claim_states, version, created_at, updated_at
		 FROM lists WHERE id = ?`, id,
	)
	rec, err := d.scanList(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return rec, err
}

func (d *DB) Update(id string, req UpdateListRequest) (*ListResponse, error) {
	now := time.Now().UTC()
	res, err := d.db.Exec(
		`UPDATE lists
		 SET blobs = ?, key_handles = ?, version = version + 1, updated_at = ?
		 WHERE id = ?`,
		marshalMap(req.Blobs), marshalMap(req.KeyHandles), now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	return d.Get(id)
}

func (d *DB) Claim(id string, req ClaimRequest) (*ListResponse, error) {
	// Read current claim_states, mutate, and write back in a single transaction.
	tx, err := d.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var claimStatesJSON string
	err = tx.QueryRow(`SELECT claim_states FROM lists WHERE id = ?`, id).Scan(&claimStatesJSON)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	states := unmarshalMap(claimStatesJSON)
	if req.Claim {
		states[req.GiftID] = "claimed"
	} else {
		delete(states, req.GiftID)
	}

	_, err = tx.Exec(
		`UPDATE lists SET claim_states = ?, updated_at = ? WHERE id = ?`,
		marshalMap(states), time.Now().UTC(), id,
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return d.Get(id)
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonResp(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func makeHandler(store *DB) http.Handler {
	mux := http.NewServeMux()

	// POST /lists — create
	mux.HandleFunc("POST /lists", func(w http.ResponseWriter, r *http.Request) {
		var req CreateListRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, err := store.Create(req)
		if err != nil {
			log.Printf("create error: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		jsonResp(w, 201, rec)
	})

	// GET /lists/{id} — fetch
	mux.HandleFunc("GET /lists/{id}", func(w http.ResponseWriter, r *http.Request) {
		rec, err := store.Get(r.PathValue("id"))
		if err != nil {
			log.Printf("get error: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		if rec == nil {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, rec)
	})

	// PUT /lists/{id} — update blobs
	mux.HandleFunc("PUT /lists/{id}", func(w http.ResponseWriter, r *http.Request) {
		var req UpdateListRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, err := store.Update(r.PathValue("id"), req)
		if err != nil {
			log.Printf("update error: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		if rec == nil {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, rec)
	})

	// POST /lists/{id}/claim — toggle claim state
	mux.HandleFunc("POST /lists/{id}/claim", func(w http.ResponseWriter, r *http.Request) {
		var req ClaimRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, err := store.Claim(r.PathValue("id"), req)
		if err != nil {
			log.Printf("claim error: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		if rec == nil {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, rec)
	})

	// GET /health
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		jsonResp(w, 200, map[string]string{"status": "ok"})
	})

	return cors(mux)
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "giftvault.db"
	}

	store, err := openDB(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	log.Printf("database: %s", dbPath)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("giftvault backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, makeHandler(store)))
}
