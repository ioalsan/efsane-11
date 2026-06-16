import csv
import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path.home() / ".cache" / "kagglehub" / "datasets" / "davidcariboo" / "player-scores"
VERSIONS = sorted((CACHE / "versions").glob("*"), key=lambda path: int(path.name), reverse=True)
DATA_DIR = VERSIONS[0] if VERSIONS else None
OUTPUT = ROOT / "src" / "data" / "season-2025-26.json"
TEMPLATE = OUTPUT

REQUIRED_FILES = ("players.csv", "clubs.csv", "games.csv", "game_lineups.csv")

CANONICAL_NAMES = {
    "bod-glimt": "Bodø/Glimt",
    "crvena-zvezda": "Crvena zvezda",
    "kopenhag": "København",
    "shakhtar-donetsk": "Šahtar Donetsk",
}

SOURCE_HINTS = {
    "ajax": "AFC Ajax",
    "basaksehir": "İstanbul Başakşehir",
    "besiktas": "Beşiktaş Jimnastik",
    "atalanta": "Atalanta Bergamasca",
    "athletic-club": "Athletic Club Bilbao",
    "benfica": "Sport Lisboa e Benfica",
    "inter": "Internazionale Milano",
    "marsilya": "Olympique de Marseille",
    "napoli": "Sportiva Calcio Napoli",
    "olympiacos": "Olympiakos",
    "psv": "Philips Sport Vereniging",
    "sporting-cp": "Sporting Clube de Portugal",
    "union-sg": "Union Saint-Gilloise",
    "salzburg": "Red Bull Salzburg",
    "genk": "Racing Club Genk",
    "lille": "Lille Olympique",
    "lyon": "Olympique Lyonnais",
    "nice": "Olympique Gymnaste Club Nice",
    "paok": "Panthessalonikios",
    "ferencvaros": "Ferencvárosi",
    "maccabi-tel-aviv": "Maccabi Tel Aviv",
    "crvena-zvezda": "Crvena zvezda",
    "noah": "FC Noah",
    "zrinjski": "Zrinjski Mostar",
    "aek-larnaca": "AEK Larnaca",
    "omonoia": "Omonia Nicosia",
    "kups-kuopio": "Kuopion Palloseura",
    "strasbourg": "Strasbourg Alsace",
    "mainz": "Mainz 05",
    "lincoln-red-imps": "Lincoln Red Imps",
    "aek-atina": "Konstantinoupoleos",
    "brei-ablik": "Breidablik",
    "fiorentina": "Calcio Fiorentina",
    "drita": "FC Drita",
    "hamrun-spartans": "Hamrun Spartans",
    "shkendija": "Shkendija Tetovo",
    "jagiellonia-bia-ystok": "Jagiellonia-Bialystok",
    "lech-poznan": "Lech Poznań",
    "legia-varsova": "Legia Warszawa",
    "rakow": "Raków Częstochowa",
    "shamrock-rovers": "Shamrock Rovers",
    "shelbourne": "Shelbourne",
    "slovan-bratislava": "Slovan Bratislava",
    "celje": "NK Celje",
    "universitatea-craiova": "Craiova",
    "kopenhag": "Football Club København",
    "shakhtar-donetsk": "Shakhtar Donetsk",
    "rapid-wien": "Sportklub Rapid",
    "sparta-prag": "Sparta Praha",
    "sigma-olomouc": "Sigma Olomouc",
    "az-alkmaar": "Alkmaar Zaanstreek",
    "dynamo-kyiv": "Dynamo Kyiv",
}

COMPETITION_CODES = {
    "super-lig": "TR1",
    "champions-league": "CL",
    "europa-league": "EL",
    "conference-league": "UCOL",
}

COMPETITION_CONFIG = {
    "super-lig": {
        "format": "league",
        "leagueMatchCount": 34,
        "leaguePhaseMatchCount": 34,
        "homeAway": True,
        "groupCount": 0,
        "groupSize": 0,
        "groups": [],
        "knockoutRounds": [],
    },
    "champions-league": {
        "format": "group_knockout",
        "leagueMatchCount": 8,
        "leaguePhaseMatchCount": 8,
        "homeAway": False,
        "groupCount": 0,
        "groupSize": 0,
        "groups": [],
        "knockoutRounds": ["round-of-16", "quarter-final", "semi-final", "final"],
    },
    "europa-league": {
        "format": "group_knockout",
        "leagueMatchCount": 8,
        "leaguePhaseMatchCount": 8,
        "homeAway": False,
        "groupCount": 0,
        "groupSize": 0,
        "groups": [],
        "knockoutRounds": ["round-of-16", "quarter-final", "semi-final", "final"],
    },
    "conference-league": {
        "format": "group_knockout",
        "leagueMatchCount": 6,
        "leaguePhaseMatchCount": 6,
        "homeAway": False,
        "groupCount": 0,
        "groupSize": 0,
        "groups": [],
        "knockoutRounds": ["round-of-16", "quarter-final", "semi-final", "final"],
    },
}

WORLD_CUP_GROUPS = {
    "A": [
        ("mexico", "Meksika", "Mexico"),
        ("south-africa", "Güney Afrika", "South Africa"),
        ("south-korea", "Güney Kore", "Korea, South"),
        ("czechia", "Çekya", "Czech Republic"),
    ],
    "B": [
        ("canada", "Kanada", "Canada"),
        ("switzerland", "İsviçre", "Switzerland"),
        ("qatar", "Katar", "Qatar"),
        ("bosnia-herzegovina", "Bosna-Hersek", "Bosnia-Herzegovina"),
    ],
    "C": [
        ("brazil", "Brezilya", "Brazil"),
        ("morocco", "Fas", "Morocco"),
        ("scotland", "İskoçya", "Scotland"),
        ("haiti", "Haiti", "Haiti"),
    ],
    "D": [
        ("united-states", "ABD", "United States"),
        ("paraguay", "Paraguay", "Paraguay"),
        ("australia", "Avustralya", "Australia"),
        ("turkiye", "Türkiye", "Turkey"),
    ],
    "E": [
        ("germany", "Almanya", "Germany"),
        ("curacao", "Curaçao", "Curacao"),
        ("ivory-coast", "Fildişi Sahili", "Cote d'Ivoire"),
        ("ecuador", "Ekvador", "Ecuador"),
    ],
    "F": [
        ("netherlands", "Hollanda", "Netherlands"),
        ("japan", "Japonya", "Japan"),
        ("sweden", "İsveç", "Sweden"),
        ("tunisia", "Tunus", "Tunisia"),
    ],
    "G": [
        ("belgium", "Belçika", "Belgium"),
        ("egypt", "Mısır", "Egypt"),
        ("iran", "İran", "Iran"),
        ("new-zealand", "Yeni Zelanda", "New Zealand"),
    ],
    "H": [
        ("spain", "İspanya", "Spain"),
        ("cabo-verde", "Cabo Verde", "Cape Verde"),
        ("saudi-arabia", "Suudi Arabistan", "Saudi Arabia"),
        ("uruguay", "Uruguay", "Uruguay"),
    ],
    "I": [
        ("france", "Fransa", "France"),
        ("senegal", "Senegal", "Senegal"),
        ("iraq", "Irak", "Iraq"),
        ("norway", "Norveç", "Norway"),
    ],
    "J": [
        ("argentina", "Arjantin", "Argentina"),
        ("algeria", "Cezayir", "Algeria"),
        ("austria", "Avusturya", "Austria"),
        ("jordan", "Ürdün", "Jordan"),
    ],
    "K": [
        ("portugal", "Portekiz", "Portugal"),
        ("dr-congo", "Demokratik Kongo", "DR Congo"),
        ("uzbekistan", "Özbekistan", "Uzbekistan"),
        ("colombia", "Kolombiya", "Colombia"),
    ],
    "L": [
        ("england", "İngiltere", "England"),
        ("croatia", "Hırvatistan", "Croatia"),
        ("ghana", "Gana", "Ghana"),
        ("panama", "Panama", "Panama"),
    ],
}

POSITION_MAP = {
    "Goalkeeper": "GK",
    "Centre-Back": "CB",
    "Left-Back": "LB",
    "Right-Back": "RB",
    "Defensive Midfield": "DM",
    "Central Midfield": "CM",
    "Left Midfield": "LW",
    "Right Midfield": "RW",
    "Attacking Midfield": "AM",
    "Left Winger": "LW",
    "Right Winger": "RW",
    "Second Striker": "ST",
    "Centre-Forward": "ST",
    "Attack": "ST",
    "Midfield": "CM",
    "Defender": "CB",
}

POSITION_BASE = {
    "GK": dict(attack=-22, defense=-4, passing=-8, pace=-12, shooting=-28, dribbling=-15, goalkeeping=8),
    "CB": dict(attack=-12, defense=7, passing=-3, pace=-4, shooting=-15, dribbling=-8, goalkeeping=-35),
    "LB": dict(attack=-4, defense=4, passing=1, pace=5, shooting=-9, dribbling=2, goalkeeping=-35),
    "RB": dict(attack=-4, defense=4, passing=1, pace=5, shooting=-9, dribbling=2, goalkeeping=-35),
    "DM": dict(attack=-5, defense=5, passing=5, pace=-1, shooting=-7, dribbling=0, goalkeeping=-35),
    "CM": dict(attack=0, defense=0, passing=7, pace=0, shooting=-1, dribbling=4, goalkeeping=-35),
    "AM": dict(attack=5, defense=-9, passing=7, pace=3, shooting=4, dribbling=7, goalkeeping=-35),
    "LW": dict(attack=6, defense=-10, passing=2, pace=8, shooting=4, dribbling=8, goalkeeping=-35),
    "RW": dict(attack=6, defense=-10, passing=2, pace=8, shooting=4, dribbling=8, goalkeeping=-35),
    "ST": dict(attack=9, defense=-14, passing=-3, pace=4, shooting=9, dribbling=3, goalkeeping=-35),
}

RATING_OVERRIDES = {
    "401923": 91,
    "541537": 83,
}


def normalize(value):
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", value)


def clamp(value, minimum=1, maximum=99):
    return max(minimum, min(maximum, int(round(value))))


def stable_variation(value):
    result = 0
    for character in value:
        result = ((result * 31) + ord(character)) & 0xFFFFFFFF
    return (result % 7) - 3


def to_position(value, fallback="CM"):
    return POSITION_MAP.get(value or "", fallback)


def rating_from_profile(player):
    if player["player_id"] in RATING_OVERRIDES:
        return RATING_OVERRIDES[player["player_id"]]
    market_value = float(player.get("market_value_in_eur") or 0)
    caps = int(float(player.get("international_caps") or 0))
    if market_value <= 0:
        base = 66
    else:
        base = 62 + math.log10(max(1, market_value / 100_000)) * 8.2
    return clamp(base + min(3, caps / 25), 62, 93)


def attributes_for(player_id, rating, position):
    offsets = POSITION_BASE[position]
    attributes = {
        key: clamp(rating + offset + stable_variation(f"{player_id}:{key}"), 20, 97)
        for key, offset in offsets.items()
    }
    if position != "GK":
        attributes["goalkeeping"] = clamp(
            12 + stable_variation(f"{player_id}:goalkeeping"),
            5,
            25,
        )
    return attributes


def read_template():
    with TEMPLATE.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_rows(name):
    path = DATA_DIR / name
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def competition_source_teams(games, competition_code):
    teams = {}
    for game in games:
        if game["season"] != "2025" or game["competition_id"] != competition_code:
            continue
        teams[game["home_club_id"]] = game["home_club_name"]
        teams[game["away_club_id"]] = game["away_club_name"]
    return teams


def match_teams(template, games):
    matched = {}
    expected_team_ids = set()
    for competition in template["competitions"]:
        if competition["competitionId"] not in COMPETITION_CODES:
            continue
        expected_team_ids.update(competition["teams"])
        source_teams = competition_source_teams(games, COMPETITION_CODES[competition["competitionId"]])
        used = set()
        for team_id in competition["teams"]:
            if team_id in matched:
                used.add(matched[team_id])
                continue
            team = next(item for item in template["teams"] if item["id"] == team_id)
            hint = SOURCE_HINTS.get(team_id, team["name"])
            best = None
            for source_id, source_name in source_teams.items():
                if source_id in used:
                    continue
                score = SequenceMatcher(None, normalize(hint), normalize(source_name)).ratio()
                if normalize(hint) in normalize(source_name) or normalize(source_name) in normalize(hint):
                    score += 0.3
                if best is None or score > best[0]:
                    best = (score, source_id, source_name)
            if best is None or best[0] < 0.55:
                raise RuntimeError(f"Takım eşleşmedi: {team['name']} -> {best}")
            matched[team_id] = best[1]
            used.add(best[1])
    if len(matched) != len(expected_team_ids):
        raise RuntimeError(f"Eşleşme sayısı hatalı: {len(matched)} / {len(expected_team_ids)}")
    return matched


def read_lineup_usage(target_club_ids):
    latest_number = {}
    positions = defaultdict(Counter)
    appearances = Counter()
    starts = Counter()
    lineup_profiles = {}
    latest_club = {}
    path = DATA_DIR / "game_lineups.csv"
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["club_id"] not in target_club_ids or not row["date"].startswith(("2025-", "2026-")):
                continue
            if not ("2025-07-01" <= row["date"] <= "2026-06-30"):
                continue
            player_id = row["player_id"]
            key = (row["club_id"], player_id)
            if player_id not in latest_club or row["date"] >= latest_club[player_id][0]:
                latest_club[player_id] = (row["date"], row["club_id"])
            lineup_profiles[player_id] = {
                "player_id": player_id,
                "name": row["player_name"],
                "sub_position": row["position"],
                "position": row["position"],
                "country_of_citizenship": "",
                "country_of_birth": "",
                "market_value_in_eur": "",
                "international_caps": "",
            }
            appearances[key] += 1
            if row["type"] == "starting_lineup":
                starts[key] += 1
            if row["position"]:
                positions[key][to_position(row["position"])] += 1
            if row["number"]:
                previous = latest_number.get(key)
                if previous is None or row["date"] >= previous[0]:
                    latest_number[key] = (row["date"], row["number"])
    return latest_number, positions, appearances, starts, lineup_profiles, latest_club


def create_world_cup_data(players_source):
    profiles_by_nationality = defaultdict(list)
    for player in players_source:
        if player.get("last_season") == "2025" and player.get("country_of_citizenship"):
            profiles_by_nationality[player["country_of_citizenship"]].append(player)

    national_teams = []
    national_players = []
    groups = []
    for group_id, group_entries in WORLD_CUP_GROUPS.items():
        group_team_ids = []
        for team_id, team_name, nationality in group_entries:
            candidates = profiles_by_nationality[nationality]
            candidates.sort(
                key=lambda row: (
                    float(row.get("market_value_in_eur") or 0),
                    int(float(row.get("international_caps") or 0)),
                ),
                reverse=True,
            )
            squad = candidates[:26]
            team_player_ids = []
            ratings = []
            used_source_ids = set()
            for index, source in enumerate(squad):
                source_player_id = source["player_id"]
                if source_player_id in used_source_ids:
                    continue
                used_source_ids.add(source_player_id)
                primary = to_position(source.get("sub_position"), to_position(source.get("position")))
                rating = rating_from_profile(source)
                player_id = f"nt-{team_id}-{source_player_id}"
                team_player_ids.append(player_id)
                ratings.append(rating)
                national_players.append({
                    "id": player_id,
                    "teamId": team_id,
                    "name": (source.get("name") or "").strip() or f"Player {index + 1}",
                    "playerType": "nationalTeam",
                    "number": index + 1,
                    "primaryPosition": primary,
                    "secondaryPositions": [],
                    "rating": rating,
                    "form": 0,
                    "nationality": nationality,
                    "isActive": True,
                    "attributes": attributes_for(source_player_id, rating, primary),
                    "sourcePlayerId": int(source_player_id),
                })

            while len(team_player_ids) < 26:
                number = len(team_player_ids) + 1
                placeholder_id = f"nt-{team_id}-placeholder-{number}"
                primary = "GK" if number <= 3 else "CB" if number <= 10 else "CM" if number <= 18 else "ST"
                team_player_ids.append(placeholder_id)
                ratings.append(64)
                national_players.append({
                    "id": placeholder_id,
                    "teamId": team_id,
                    "name": f"Player {number}",
                    "playerType": "nationalTeam",
                    "number": number,
                    "primaryPosition": primary,
                    "secondaryPositions": [],
                    "rating": 64,
                    "form": 0,
                    "nationality": nationality,
                    "isActive": True,
                    "attributes": attributes_for(placeholder_id, 64, primary),
                })

            national_teams.append({
                "id": team_id,
                "name": team_name,
                "teamType": "nationalTeam",
                "country": team_name,
                "league": "FIFA Dünya Kupası 2026",
                "competitionIds": ["world-cup-2026"],
                "strengthBonus": clamp(sum(ratings[:18]) / max(1, len(ratings[:18])) - 75, -8, 8),
                "players": team_player_ids,
            })
            group_team_ids.append(team_id)

        groups.append({
            "groupId": group_id,
            "groupName": f"Grup {group_id}",
            "teamIds": group_team_ids,
        })

    competition = {
        "competitionId": "world-cup-2026",
        "competitionName": "FIFA Dünya Kupası 2026",
        "season": "2026",
        "format": "world_cup_48",
        "leagueMatchCount": 3,
        "leaguePhaseMatchCount": 3,
        "homeAway": False,
        "groupCount": 12,
        "groupSize": 4,
        "groups": groups,
        "knockoutRounds": ["round-of-32", "round-of-16", "quarter-final", "semi-final", "final"],
        "teams": [team_id for group in groups for team_id in group["teamIds"]],
        "players": [player["id"] for player in national_players],
    }
    return competition, national_teams, national_players


def main():
    if DATA_DIR is None or any(not (DATA_DIR / name).exists() for name in REQUIRED_FILES):
        missing = ", ".join(REQUIRED_FILES)
        raise SystemExit(f"Kaggle ham verisi eksik ({missing}). Önce scripts/fetch-real-data.py çalıştırın.")

    template = read_template()
    games = load_rows("games.csv")
    players_source = load_rows("players.csv")
    club_mapping = match_teams(template, games)
    target_club_ids = set(club_mapping.values())
    latest_number, played_positions, appearances, starts, lineup_profiles, latest_club = read_lineup_usage(target_club_ids)

    players_by_id = {player["player_id"]: player for player in players_source}
    for player_id, profile in lineup_profiles.items():
        players_by_id.setdefault(player_id, profile)
    source_players = defaultdict(set)
    assigned_club = {}
    for player in players_source:
        if player["last_season"] == "2025" and player["current_club_id"] in target_club_ids:
            assigned_club[player["player_id"]] = player["current_club_id"]
    for player_id, (_, club_id) in latest_club.items():
        assigned_club.setdefault(player_id, club_id)
    for player_id, club_id in assigned_club.items():
        if player_id in players_by_id:
            source_players[club_id].add(player_id)

    players = []
    teams = []
    club_template_teams = [
        team for team in template["teams"]
        if team.get("teamType", "club") == "club"
    ]
    for team in club_template_teams:
        source_club_id = club_mapping[team["id"]]
        squad = [players_by_id[player_id] for player_id in source_players[source_club_id]]
        squad.sort(
            key=lambda row: (
                row.get("current_club_id") == source_club_id,
                appearances[(source_club_id, row["player_id"])],
                float(row.get("market_value_in_eur") or 0),
            ),
            reverse=True,
        )
        squad = squad[:30]
        if len(squad) < 11:
            raise RuntimeError(f"Yetersiz gerçek kadro: {team['name']} ({len(squad)})")

        team_player_ids = []
        used_numbers = set()
        for index, source in enumerate(sorted(squad, key=lambda row: int(row["player_id"]))):
            source_player_id = source["player_id"]
            key = (source_club_id, source_player_id)
            primary = to_position(source.get("sub_position"), to_position(source.get("position")))
            observed = [item[0] for item in played_positions[key].most_common()]
            secondary = [position for position in observed if position != primary][:3]
            number_value = latest_number.get(key, ("", ""))[1]
            try:
                jersey_number = int(number_value)
            except ValueError:
                jersey_number = 0
            if jersey_number < 1 or jersey_number > 99 or jersey_number in used_numbers:
                jersey_number = next(number for number in range(1, 100) if number not in used_numbers)
            used_numbers.add(jersey_number)

            rating = rating_from_profile(source)
            usage = starts[key] + (appearances[key] - starts[key]) * 0.4
            form = clamp((usage / max(1, appearances[key])) * 8 - 4, -5, 5)
            player_id = f"tm-{source_player_id}"
            player_name = (source.get("name") or "").strip() or f"Player {index + 1}"
            team_player_ids.append(player_id)
            players.append({
                "id": player_id,
                "teamId": team["id"],
                "name": player_name,
                "playerType": "club",
                "number": jersey_number,
                "primaryPosition": primary,
                "secondaryPositions": secondary,
                "rating": rating,
                "form": form,
                "nationality": source["country_of_citizenship"] or source["country_of_birth"] or team["country"],
                "isActive": True,
                "attributes": attributes_for(source_player_id, rating, primary),
                "sourcePlayerId": int(source_player_id),
            })

        canonical_name = CANONICAL_NAMES.get(team["id"], team["name"])
        teams.append({
            **team,
            "sourceClubId": int(source_club_id),
            "name": canonical_name,
            "teamType": "club",
            "players": team_player_ids,
        })

    players_by_team = defaultdict(list)
    for player in players:
        players_by_team[player["teamId"]].append(player["id"])

    competitions = []
    for competition in template["competitions"]:
        if competition["competitionId"] not in COMPETITION_CONFIG:
            continue
        competition_players = []
        for team_id in competition["teams"]:
            competition_players.extend(players_by_team[team_id])
        competitions.append({
            **competition,
            **COMPETITION_CONFIG[competition["competitionId"]],
            "players": competition_players,
        })

    world_cup_competition, national_teams, national_players = create_world_cup_data(players_source)
    competitions.append(world_cup_competition)
    teams.extend(national_teams)
    players.extend(national_players)

    galatasaray = next(team for team in teams if team["id"] == "galatasaray")
    champions_league = next(
        competition for competition in competitions
        if competition["competitionId"] == "champions-league"
    )
    if "champions-league" not in galatasaray["competitionIds"]:
        galatasaray["competitionIds"].append("champions-league")
    if "galatasaray" not in champions_league["teams"]:
        champions_league["teams"].append("galatasaray")
    champions_league["players"] = [
        player_id
        for team_id in champions_league["teams"]
        for player_id in next(team for team in teams if team["id"] == team_id)["players"]
    ]

    output = {
        "schemaVersion": 4,
        "season": "2025-2026",
        "generatedAt": date.today().isoformat(),
        "sources": [
            "https://www.kaggle.com/datasets/davidcariboo/player-scores",
            "https://www.tff.org/default.aspx?pageID=1768",
            "https://www.uefa.com/",
            "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams",
            "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/final-draw-results",
        ],
        "settings": {
            "adsEnabled": True,
            "chanceFactor": 1,
            "penaltiesEnabled": True,
            "injuryChance": 0.025,
            "simulateOtherMatches": True,
        },
        "competitions": competitions,
        "teams": teams,
        "players": players,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(teams)} gerçek takım ve {len(players)} gerçek oyuncu yazıldı: {OUTPUT}")


if __name__ == "__main__":
    main()
