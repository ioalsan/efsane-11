from pathlib import Path

try:
    import kagglehub
except ImportError as error:
    raise SystemExit("Önce `python -m pip install kagglehub` çalıştırın.") from error

HANDLE = "davidcariboo/player-scores"
FILES = ("players.csv", "clubs.csv", "games.csv", "game_lineups.csv")

for name in FILES:
    path = kagglehub.dataset_download(HANDLE, path=name)
    print(f"{name}: {Path(path)}")
