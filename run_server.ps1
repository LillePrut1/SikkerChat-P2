# Navigate to the script directory
Set-Location $PSScriptRoot

# Activate virtual environment
& .\.venv\Scripts\Activate.ps1

# Run the server
python server.py

# Keep the window open if there's an error
pause
