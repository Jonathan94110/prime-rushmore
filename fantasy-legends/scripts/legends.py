"""Curated 1950-1999 stars for the Fantasy Legends dataset.

Each entry: (name as it appears in the source data, fantasy position, Hall of Fame).
`hof` is set by hand because the source scrape left hof_induction_year empty.
"""

LEGENDS = [
    # Quarterbacks
    ("Otto Graham", "QB", True), ("Bobby Layne", "QB", True), ("Norm Van Brocklin", "QB", True),
    ("Y.A. Tittle", "QB", True), ("Johnny Unitas", "QB", True), ("Bart Starr", "QB", True),
    ("Sonny Jurgensen", "QB", True), ("Len Dawson", "QB", True), ("Joe Namath", "QB", True),
    ("Fran Tarkenton", "QB", True), ("Bob Griese", "QB", True), ("Roger Staubach", "QB", True),
    ("Terry Bradshaw", "QB", True), ("Ken Stabler", "QB", True), ("Dan Fouts", "QB", True),
    ("Ken Anderson", "QB", False), ("Joe Montana", "QB", True), ("Dan Marino", "QB", True),
    ("John Elway", "QB", True), ("Jim Kelly", "QB", True), ("Warren Moon", "QB", True),
    ("Steve Young", "QB", True), ("Troy Aikman", "QB", True), ("Brett Favre", "QB", True),
    ("Randall Cunningham", "QB", False), ("Boomer Esiason", "QB", False),
    # Running backs
    ("Joe Perry", "RB", True), ("Hugh McElhenny", "RB", True), ("Jim Brown", "RB", True),
    ("Paul Hornung", "RB", True), ("Jim Taylor", "RB", True), ("Gale Sayers", "RB", True),
    ("Leroy Kelly", "RB", True), ("Floyd Little", "RB", True), ("Larry Csonka", "RB", True),
    ("O.J. Simpson", "RB", True), ("Franco Harris", "RB", True), ("Walter Payton", "RB", True),
    ("Chuck Foreman", "RB", False), ("Tony Dorsett", "RB", True), ("Earl Campbell", "RB", True),
    ("John Riggins", "RB", True), ("Ottis Anderson", "RB", False), ("Eric Dickerson", "RB", True),
    ("Marcus Allen", "RB", True), ("Roger Craig", "RB", False), ("Bo Jackson", "RB", False),
    ("Thurman Thomas", "RB", True), ("Barry Sanders", "RB", True), ("Emmitt Smith", "RB", True),
    ("Marshall Faulk", "RB", True), ("Terrell Davis", "RB", True), ("Curtis Martin", "RB", True),
    # Wide receivers
    ("Elroy Hirsch", "WR", True), ("Tom Fears", "WR", True), ("Raymond Berry", "WR", True),
    ("Lenny Moore", "WR", True), ("Bobby Mitchell", "WR", True), ("Don Maynard", "WR", True),
    ("Lance Alworth", "WR", True), ("Charley Taylor", "WR", True), ("Paul Warfield", "WR", True),
    ("Fred Biletnikoff", "WR", True), ("Lynn Swann", "WR", True), ("John Stallworth", "WR", True),
    ("Steve Largent", "WR", True), ("James Lofton", "WR", True), ("Charlie Joiner", "WR", True),
    ("Art Monk", "WR", True), ("Jerry Rice", "WR", True), ("Michael Irvin", "WR", True),
    ("Andre Reed", "WR", True), ("Cris Carter", "WR", True), ("Tim Brown", "WR", True),
    ("Sterling Sharpe", "WR", False),
    # Tight ends
    ("Mike Ditka", "TE", True), ("John Mackey", "TE", True), ("Jackie Smith", "TE", True),
    ("Charlie Sanders", "TE", True), ("Dave Casper", "TE", True), ("Kellen Winslow", "TE", True),
    ("Ozzie Newsome", "TE", True), ("Mark Bavaro", "TE", False), ("Shannon Sharpe", "TE", True),
    ("Ben Coates", "TE", False),
    # Kickers
    ("Lou Groza", "K", True), ("George Blanda", "K", True), ("Jan Stenerud", "K", True),
    ("Garo Yepremian", "K", False), ("Nick Lowery", "K", False), ("Morten Andersen", "K", True),
    ("Gary Anderson", "K", False),
]

# Iconic team defenses, (team code, season, nickname). Every team-season gets a DST log;
# these are flagged as featured.
FEATURED_DEFENSES = [
    ("CHI", 1963, "Monsters of the Midway"), ("BAL", 1968, None), ("MIN", 1969, "Purple People Eaters"),
    ("MIN", 1971, "Purple People Eaters"), ("DAL", 1971, "Doomsday Defense"), ("MIA", 1972, "No-Name Defense"),
    ("PIT", 1974, "Steel Curtain"), ("PIT", 1975, "Steel Curtain"), ("PIT", 1976, "Steel Curtain"),
    ("ATL", 1977, "Grits Blitz"), ("DAL", 1977, "Doomsday II"), ("CHI", 1985, "46 Defense"),
    ("NYG", 1986, "Big Blue Wrecking Crew"), ("PHI", 1991, "Gang Green"), ("GNB", 1996, None),
]

# Position pools: every player at the position who clears a career (1950-1999) yardage bar,
# on top of the hand-picked LEGENDS above. Source positions are hyphenated lists like "HB-FB";
# a player listed at several positions goes to the first one listed ("RB-WR" -> RB, "WR-TE" -> WR,
# "TE-WR" -> TE). Kickers are picked by field goals made whatever their listed position, since
# early kickers were often linemen or receivers (Lou Groza, Gino Cappelletti); they're picked first.
POOLS = {
    "K": {"any_position": True, "stat": "field_goal_makes", "min_career": 50},
    "RB": {"source_positions": {"RB", "HB", "FB", "TB"}, "stat": "rushing_yards", "min_career": 2000},
    "WR": {"source_positions": {"WR", "FL", "SE", "E"}, "stat": "receiving_yards", "min_career": 2000},
    "TE": {"source_positions": {"TE"}, "stat": "receiving_yards", "min_career": 1500},
    "QB": {"source_positions": {"QB"}, "stat": "passing_yards", "min_career": 5000},
}

# Hall of Famers who come in through a pool rather than LEGENDS.
POOL_HALL_OF_FAMERS = {
    "Steve Van Buren", "Marion Motley", "Ollie Matson", "John Henry Johnson", "Frank Gifford",
    "Charley Trippi", "Doak Walker", "Jerome Bettis", "Edgerrin James", "Lenny Moore",
    "Dante Lavelli", "Pete Pihos", "Bobby Mitchell", "Tommy McDonald", "Bob Hayes",
    "Elroy Hirsch", "Tom Fears", "Raymond Berry", "Don Maynard", "Charlie Joiner",
}
