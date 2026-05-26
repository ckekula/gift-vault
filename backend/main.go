package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

func newID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type ListRecord struct {
	ID          string            `json:"id"`
	Blobs       map[string]string `json:"blobs"`
	KeyHandles  map[string]string `json:"key_handles"`
	ClaimStates map[string]string `json:"claim_states"`
	Version     int               `json:"version"`
	CreatedAt   time.Time         `json:"created_at"`
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

type ListResponse struct {
	ID          string            `json:"id"`
	Blobs       map[string]string `json:"blobs"`
	KeyHandles  map[string]string `json:"key_handles"`
	ClaimStates map[string]string `json:"claim_states"`
	Version     int               `json:"version"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

type Store struct {
	mu    sync.RWMutex
	lists map[string]*ListRecord
}

func NewStore() *Store { return &Store{lists: make(map[string]*ListRecord)} }

func (s *Store) Create(req CreateListRequest) *ListRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	rec := &ListRecord{
		ID: newID(), Blobs: req.Blobs, KeyHandles: req.KeyHandles,
		ClaimStates: map[string]string{}, Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	s.lists[rec.ID] = rec
	return rec
}

func (s *Store) Get(id string) (*ListRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.lists[id]
	return rec, ok
}

func (s *Store) Update(id string, req UpdateListRequest) (*ListRecord, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.lists[id]
	if !ok {
		return nil, false
	}
	rec.Blobs = req.Blobs
	rec.KeyHandles = req.KeyHandles
	rec.Version++
	rec.UpdatedAt = time.Now()
	return rec, true
}

func (s *Store) Claim(id string, req ClaimRequest) (*ListRecord, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.lists[id]
	if !ok {
		return nil, false
	}
	if req.Claim {
		rec.ClaimStates[req.GiftID] = "claimed"
	} else {
		delete(rec.ClaimStates, req.GiftID)
	}
	rec.UpdatedAt = time.Now()
	return rec, true
}

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

func toResp(rec *ListRecord) ListResponse {
	return ListResponse{ID: rec.ID, Blobs: rec.Blobs, KeyHandles: rec.KeyHandles,
		ClaimStates: rec.ClaimStates, Version: rec.Version, UpdatedAt: rec.UpdatedAt}
}

func main() {
	store := NewStore()
	mux := http.NewServeMux()

	mux.HandleFunc("POST /lists", func(w http.ResponseWriter, r *http.Request) {
		var req CreateListRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		jsonResp(w, 201, toResp(store.Create(req)))
	})

	mux.HandleFunc("GET /lists/{id}", func(w http.ResponseWriter, r *http.Request) {
		rec, ok := store.Get(r.PathValue("id"))
		if !ok {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, toResp(rec))
	})

	mux.HandleFunc("PUT /lists/{id}", func(w http.ResponseWriter, r *http.Request) {
		var req UpdateListRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, ok := store.Update(r.PathValue("id"), req)
		if !ok {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, toResp(rec))
	})

	mux.HandleFunc("POST /lists/{id}/claim", func(w http.ResponseWriter, r *http.Request) {
		var req ClaimRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResp(w, 400, map[string]string{"error": "invalid body"})
			return
		}
		rec, ok := store.Claim(r.PathValue("id"), req)
		if !ok {
			jsonResp(w, 404, map[string]string{"error": "not found"})
			return
		}
		jsonResp(w, 200, toResp(rec))
	})

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		jsonResp(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("giftvault backend on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, cors(mux)))
}
