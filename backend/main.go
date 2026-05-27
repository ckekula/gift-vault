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

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
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

type DB struct{ db *sql.DB }

const schema = `
CREATE TABLE IF NOT EXISTS lists (
	id           TEXT PRIMARY KEY,
	blobs        JSONB NOT NULL DEFAULT '{}',
	key_handles  JSONB NOT NULL DEFAULT '{}',
	claim_states JSONB NOT NULL DEFAULT '{}',
	version      INTEGER NOT NULL DEFAULT 1,
	created_at   TIMESTAMPTZ NOT NULL,
	updated_at   TIMESTAMPTZ NOT NULL
);
`

func openDB(connStr string) (*DB, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	log.Println("database connected and schema ready")
	return &DB{db: db}, nil
}

func marshalMap(m map[string]string) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func unmarshalMap(s string) map[string]string {
	m := map[string]string{}
	json.Unmarshal([]byte(s), &m)
	return m
}

func (d *DB) scan(row *sql.Row) (*ListResponse, error) {
	var id, blobsJSON, keyHandlesJSON, claimStatesJSON string
	var version int
	var updatedAt time.Time
	err := row.Scan(&id, &blobsJSON, &keyHandlesJSON, &claimStatesJSON, &version, &updatedAt)
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
	row := d.db.QueryRow(
		`INSERT INTO lists (id, blobs, key_handles, claim_states, version, created_at, updated_at)
		 VALUES ($1, $2, $3, '{}', 1, $4, $4)
		 RETURNING id, blobs::text, key_handles::text, claim_states::text, version, updated_at`,
		id, marshalMap(req.Blobs), marshalMap(req.KeyHandles), now,
	)
	return d.scan(row)
}

func (d *DB) Get(id string) (*ListResponse, error) {
	row := d.db.QueryRow(
		`SELECT id, blobs::text, key_handles::text, claim_states::text, version, updated_at
		 FROM lists WHERE id = $1`, id,
	)
	rec, err := d.scan(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return rec, err
}

func (d *DB) Update(id string, req UpdateListRequest) (*ListResponse, error) {
	row := d.db.QueryRow(
		`UPDATE lists
		 SET blobs = $2, key_handles = $3, version = version + 1, updated_at = $4
		 WHERE id = $1
		 RETURNING id, blobs::text, key_handles::text, claim_states::text, version, updated_at`,
		id, marshalMap(req.Blobs), marshalMap(req.KeyHandles), time.Now().UTC(),
	)
	rec, err := d.scan(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return rec, err
}

func (d *DB) Claim(id string, req ClaimRequest) (*ListResponse, error) {
	// Use Postgres JSONB operators to set/delete a key atomically — no transaction needed
	var row *sql.Row
	if req.Claim {
		row = d.db.QueryRow(
			`UPDATE lists
			 SET claim_states = claim_states || jsonb_build_object($2::text, 'claimed'::text),
			     updated_at = $3
			 WHERE id = $1
			 RETURNING id, blobs::text, key_handles::text, claim_states::text, version, updated_at`,
			id, req.GiftID, time.Now().UTC(),
		)
	} else {
		row = d.db.QueryRow(
			`UPDATE lists
			 SET claim_states = claim_states - $2,
			     updated_at = $3
			 WHERE id = $1
			 RETURNING id, blobs::text, key_handles::text, claim_states::text, version, updated_at`,
			id, req.GiftID, time.Now().UTC(),
		)
	}
	rec, err := d.scan(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return rec, err
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

func cors(next http.Handler) http.Handler {
	allowed := os.Getenv("ALLOWED_ORIGIN")
	if allowed == "" {
		allowed = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin == allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Max-Age", "86400")
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

	mux.HandleFunc("POST /lists", func(w http.ResponseWriter, r *http.Request) {
		var req CreateListRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, err := store.Create(req)
		if err != nil {
			log.Printf("create: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		jsonResp(w, 201, rec)
	})

	mux.HandleFunc("GET /lists/{id}", func(w http.ResponseWriter, r *http.Request) {
		rec, err := store.Get(r.PathValue("id"))
		if err != nil {
			log.Printf("get: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		if rec == nil {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, rec)
	})

	mux.HandleFunc("PUT /lists/{id}", func(w http.ResponseWriter, r *http.Request) {
		var req UpdateListRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, err := store.Update(r.PathValue("id"), req)
		if err != nil {
			log.Printf("update: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		if rec == nil {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, rec)
	})

	mux.HandleFunc("POST /lists/{id}/claim", func(w http.ResponseWriter, r *http.Request) {
		var req ClaimRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, err := store.Claim(r.PathValue("id"), req)
		if err != nil {
			log.Printf("claim: %v", err)
			jsonResp(w, 500, map[string]string{"error": "internal error"})
			return
		}
		if rec == nil {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, rec)
	})

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		jsonResp(w, 200, map[string]string{"status": "ok"})
	})

	return cors(mux)
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found")
	}

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	store, err := openDB(connStr)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("giftvault backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, makeHandler(store)))
}
