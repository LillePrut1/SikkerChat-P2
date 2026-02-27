# SikkerChat-P2
En sikker chatapplication som produkt i P2

Der skal laves backend i python. Frontend skal laves (Umiddelbart) i HTML og Javasript, og pyntes med CSS

Lige PT er der oprettet nogle brugere i user.json i vores backend.

Deres passwords er SHA256-hash af "Password123" UDEN SALT, det er gemt som "password_hash". 
De indskrives i index.html og returneres som "password" (dette skal hashes, og gemmes/tjekkes i ./data/user.json)
Brugernavn returneres som "username"





RENDER:COM

build command:
pip install -r requirements.txt



start command:
gunicorn server:app --bind 0.0.0.0:$PORT --workers 2


main branch server:
https://sikkerchat-p2.onrender.com