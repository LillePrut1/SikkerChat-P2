#!/usr/bin/env python3
"""Check group key rotation state in the SikkerChat-P2 repository.

This script inspects data/group_keys and data/groups to verify that:
- all current group members have encrypted key history files
- removed members do not retain a group key file
- rotation events are visible as multiple saved keys for remaining members
- key history timestamps are present and ordered

Usage:
  python check_key_rotation.py --group-id <GROUP_ID>
  python check_key_rotation.py --group-id <GROUP_ID> --removed-user <USERNAME>
  python check_key_rotation.py --group-id <GROUP_ID> --show-details
  python check_key_rotation.py --all-groups
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
GROUPS_DIR = DATA_DIR / "groups"
GROUP_KEYS_DIR = DATA_DIR / "group_keys"


def load_json(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def parse_key_entries(data: dict) -> List[dict]:
    if not isinstance(data, dict):
        return []
    if isinstance(data.get("keys"), list):
        return data["keys"]
    if data.get("encrypted_group_key"):
        return [{
            "encrypted_group_key": data["encrypted_group_key"],
            "saved_at": data.get("saved_at") or data.get("created_at") or None,
        }]
    return []


def parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def find_group_key_files(group_id: str) -> List[Path]:
    if not GROUP_KEYS_DIR.exists():
        return []
    return sorted(GROUP_KEYS_DIR.glob(f"{group_id}_*.json"))


def inspect_group(group_id: str) -> Tuple[Optional[dict], List[Path]]:
    group_path = GROUPS_DIR / f"{group_id}.json"
    group_data = load_json(group_path)
    key_files = find_group_key_files(group_id)
    return group_data, key_files


def analyze_group_keys(group_data: Optional[dict], key_files: Sequence[Path], removed_user: Optional[str]) -> dict:
    members = []
    if isinstance(group_data, dict):
        members = list(group_data.get("members", []))
    member_set = set(members)

    key_files_by_username: Dict[str, Path] = {}
    extra_files: List[str] = []
    for path in key_files:
        name = path.stem
        if "_" not in name:
            extra_files.append(path.name)
            continue
        _, username = name.split("_", 1)
        key_files_by_username[username] = path

    missing_members = [m for m in members if m not in key_files_by_username]
    stale_key_files = [u for u in key_files_by_username if u not in member_set]
    if removed_user and removed_user in key_files_by_username:
        stale_key_files.append(removed_user)

    details = {}
    rotation_detected = False
    for username, path in key_files_by_username.items():
        data = load_json(path)
        entries = parse_key_entries(data)
        timestamps = [parse_timestamp(entry.get("saved_at")) for entry in entries]

        count = len(entries)
        sorted_ts = sorted([ts for ts in timestamps if ts is not None])
        ordered = timestamps == sorted_ts
        details[username] = {
            "file": path.name,
            "entry_count": count,
            "saved_at": [entry.get("saved_at") for entry in entries],
            "has_timestamp": all(ts is not None for ts in timestamps if timestamps),
            "ordered_timestamps": ordered,
        }

        if count > 1:
            rotation_detected = True

    group_info = {
        "group_id": group_data.get("group_id") if group_data else None,
        "group_name": group_data.get("group_name") if group_data else None,
        "members": members,
        "key_files": [path.name for path in key_files],
        "missing_member_keys": missing_members,
        "stale_key_files": stale_key_files,
        "rotation_detected": rotation_detected,
        "member_details": details,
    }
    return group_info


def print_group_report(group_info: dict, show_details: bool) -> None:
    print("=== Key rotation check ===")
    print(f"Group ID: {group_info['group_id']}")
    if group_info.get("group_name"):
        print(f"Group name: {group_info['group_name']}")
    print(f"Members: {group_info['members']}")
    print(f"Key files found: {len(group_info['key_files'])}")
    print(f"Rotation detected: {'YES' if group_info['rotation_detected'] else 'NO'}")

    if group_info["missing_member_keys"]:
        print("Missing key files for current members:")
        for username in group_info["missing_member_keys"]:
            print(f"  - {username}")

    if group_info["stale_key_files"]:
        print("Stale key files for non-members or removed users:")
        for username in sorted(set(group_info["stale_key_files"])):
            print(f"  - {username}")

    if show_details:
        print("\nMember details:")
        for username, detail in sorted(group_info["member_details"].items()):
            print(f"  {username}:")
            print(f"    file: {detail['file']}")
            print(f"    entry_count: {detail['entry_count']}")
            print(f"    timestamps: {detail['saved_at']}")
            print(f"    ordered_timestamps: {detail['ordered_timestamps']}")


def list_all_groups() -> List[str]:
    if not GROUPS_DIR.exists():
        return []
    group_ids = []
    for path in sorted(GROUPS_DIR.glob("*.json")):
        data = load_json(path)
        if data and data.get("group_id"):
            group_ids.append(data["group_id"])
    return group_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Check group key rotation state.")
    parser.add_argument("--group-id", help="Group UUID to inspect")
    parser.add_argument("--removed-user", help="Username expected to have been removed and whose key file should no longer exist")
    parser.add_argument("--show-details", action="store_true", help="Show per-member key history details")
    parser.add_argument("--all-groups", action="store_true", help="Scan all groups and report rotation status")
    args = parser.parse_args()

    if not args.group_id and not args.all_groups:
        parser.error("Either --group-id or --all-groups must be provided.")

    if args.all_groups:
        group_ids = list_all_groups()
        if not group_ids:
            print("No group files found in data/groups.")
            return
        for group_id in group_ids:
            group_data, key_files = inspect_group(group_id)
            if not group_data:
                continue
            group_info = analyze_group_keys(group_data, key_files, args.removed_user)
            print_group_report(group_info, args.show_details)
            print()
        return

    group_data, key_files = inspect_group(args.group_id)
    if not group_data:
        print(f"Group file not found for group_id: {args.group_id}")
        return

    group_info = analyze_group_keys(group_data, key_files, args.removed_user)
    print_group_report(group_info, args.show_details)


if __name__ == "__main__":
    main()
