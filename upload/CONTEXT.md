# CANVASFLOW v5 - FULL SYSTEM
# ═══════════════════════════════════════════════════════════════

## 🚀 START

    swift ~/Downloads/1234/canvasflow-web/canvasflow-v5.swift

→ Generiert Passwort → Zeigt es an → Session startet

## 🔑 PASSWORD

- AUTO: Generiert sicheres 16-Zeichen Passwort
- MANUELL: swift canvasflow-v5.swift mein-passwort
- Gültig: 1 Stunde
- Reset: Nach Timeout oder Logout

## ⚠️ CONFIRMATION SYSTEM

Gefährliche Befehle → Banner im Web Terminal → Manuell bestätigen!

### Kategorien:

| Kategorie | Patterns |
|-----------|----------|
| SQL | DROP TABLE, DROP DATABASE, TRUNCATE, DELETE FROM |
| Git | push --force, reset --hard, clean -fd |
| Files | rm -r, rm -rf, rmdir |
| Docker | docker rm, docker rmi, docker prune |
| K8s | kubectl delete |
| Sudo | sudo rm, sudo chmod, sudo mv |

### Flow:

    1. Befehl senden
    2. ⚠️ Banner erscheint mit Code
    3. ✅ Button klicken zum Bestätigen
    4. Ausführung startet

## 🚫 BLOCKED (kein Override)

rm -rf /, mkfs, fork bomb, chmod 777 /, shutdown, > /etc/passwd

## 🔒 SECURITY

- Rate Limit: 30 req/min
- Lockout: 5 failed → 5 min
- Session: 1 Stunde
- Audit Log: ~/canvasflow-audit.log

## 📁 DATEIEN

- canvasflow-v5.swift  ← Mac Client (START)
- page-v5.tsx          ← Web Terminal (Copy to src/app/page.tsx)
- CONTEXT.md           ← Diese Datei

## 📤 BEFEHL SENDEN

    PASSWORD="dein-passwort"
    
    curl -X POST "http://localhost:3000/api/ably" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"canvasflow-cmd\",\"data\":{\"type\":\"command\",\"requestId\":\"req-1\",\"command\":\"ls\",\"password\":\"$PASSWORD\"}}"
    
    sleep 3
    curl "http://localhost:3000/api/ably?channel=canvasflow-result&limit=5"

## 🆕 WEB TERMINAL FEATURES

- 🔑 Password Input Field
- ⚠️ Confirmation Banner mit Buttons
- 👁️ Live Preview Panel
- 📊 Debug Output
- ✅/❌ Confirm/Cancel Buttons

## FÜR NEUEN CHAT

1. swift canvasflow-v5.swift
2. Passwort notieren
3. CONTEXT.md hochladen
4. Passwort im Web Terminal eingeben
5. Fertig!
