"""Transactional account erasure for mtunz (SQLite and Neon PostgreSQL).

The caller owns the database transaction. No user is removed until dependent
foreign-key records and user-owned message/file data are cleaned up. Preserve
groups with surviving members by transferring ownership; remove empty groups.
"""
from __future__ import annotations


def delete_user_records(c, uid: int) -> dict:
    """Erase one non-admin user and return affected peers + uploaded filenames.

    This function must only be called from a verified, confirmed account-delete
    endpoint, inside an active db() transaction. SQL identifiers are static and
    all values are parameterized.
    """
    user = c.execute(
        'SELECT id,username,is_admin FROM users WHERE id=?', (uid,)
    ).fetchone()
    if not user or user['is_admin']:
        raise ValueError('Only an existing non-admin account may be deleted.')

    username = user['username']
    filenames = [
        row['stored_name'] for row in c.execute(
            'SELECT stored_name FROM attachments WHERE owner_id=?', (uid,)
        ).fetchall()
    ]

    friend_ids = set()
    for row in c.execute(
        'SELECT u1,u2 FROM friendships WHERE u1=? OR u2=?', (uid, uid)
    ).fetchall():
        friend_ids.add(row['u2'] if row['u1'] == uid else row['u1'])

    group_ids = [
        row['group_id'] for row in c.execute(
            'SELECT group_id FROM group_members WHERE user_id=?', (uid,)
        ).fetchall()
    ]
    group_peers = set()
    for gid in group_ids:
        for member in c.execute(
            'SELECT user_id FROM group_members WHERE group_id=? AND user_id!=?',
            (gid, uid)
        ).fetchall():
            group_peers.add(member['user_id'])

    # Preserve shared groups. The oldest remaining member becomes the owner.
    for row in c.execute(
        'SELECT id FROM chat_groups WHERE created_by=?', (uid,)
    ).fetchall():
        gid = row['id']
        successor = c.execute(
            'SELECT user_id FROM group_members WHERE group_id=? AND user_id!=? '
            'ORDER BY joined_at,user_id LIMIT 1', (gid, uid)
        ).fetchone()
        if successor:
            new_owner = successor['user_id']
            c.execute(
                'UPDATE group_members SET role=? WHERE group_id=? AND user_id=?',
                ('owner', gid, new_owner)
            )
            c.execute(
                'UPDATE chat_groups SET created_by=? WHERE id=?',
                (new_owner, gid)
            )
        else:
            # No remaining members: remove the orphan group and its reactions.
            c.execute(
                "DELETE FROM reactions WHERE scope='group' AND message_id "
                'IN (SELECT id FROM group_messages WHERE group_id=?)', (gid,)
            )
            c.execute("""DELETE FROM message_edit_history WHERE scope='group' AND message_id IN
                         (SELECT id FROM group_messages WHERE group_id=?)""",(gid,))
            c.execute('DELETE FROM group_messages WHERE group_id=?', (gid,))
            c.execute('DELETE FROM group_members WHERE group_id=?', (gid,))
            c.execute('DELETE FROM chat_groups WHERE id=?', (gid,))

    # Scheduled messages may still reference this user's uploaded attachments.
    # Cancel pending work before attachments are removed or FK rows cascade.
    c.execute('DELETE FROM scheduled_messages WHERE sender_id=? OR recipient_id=?',(uid,uid))

    # Remove prior versions before deleting messages. History has no FK to
    # a message id because DMs/groups use separate message tables.
    c.execute("""DELETE FROM message_edit_history WHERE scope='dm' AND message_id IN
                 (SELECT id FROM messages WHERE sender_id=? OR recipient_id=?
                  OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?))""",
              (uid,uid,uid))
    c.execute("""DELETE FROM message_edit_history WHERE scope='group' AND message_id IN
                 (SELECT id FROM group_messages WHERE sender_id=?
                  OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?))""",
              (uid,uid))
    c.execute('DELETE FROM message_edit_history WHERE editor_id=?',(uid,))
    # Vote rows reference the user via a foreign key, explicitly remove for a
    # clean and predictable per-account data erase.
    c.execute('DELETE FROM world_poll_votes WHERE user_id=?',(uid,))

    # Remove personal pins and pins referencing messages erased with this user.
    c.execute('DELETE FROM message_pins WHERE user_id=?', (uid,))
    c.execute("""DELETE FROM message_pins WHERE scope='dm' AND message_id IN (
      SELECT id FROM messages WHERE sender_id=? OR recipient_id=?
      OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?))""",
      (uid,uid,uid))
    c.execute("""DELETE FROM message_pins WHERE scope='group' AND message_id IN (
      SELECT id FROM group_messages WHERE sender_id=?
      OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?))""",
      (uid,uid))

    # Explicitly remove reactions for deleted message IDs (no message FK).
    c.execute(
        "DELETE FROM reactions WHERE scope='dm' AND message_id IN "
        '(SELECT id FROM messages WHERE sender_id=? OR recipient_id=? '
        'OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?))',
        (uid, uid, uid)
    )
    c.execute(
        "DELETE FROM reactions WHERE scope='group' AND message_id IN "
        '(SELECT id FROM group_messages WHERE sender_id=? '
        'OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?))',
        (uid, uid)
    )
    c.execute(
        'DELETE FROM messages WHERE sender_id=? OR recipient_id=? '
        'OR attachment_id IN (SELECT id FROM attachments WHERE owner_id=?)',
        (uid, uid, uid)
    )
    c.execute(
        'DELETE FROM group_messages WHERE sender_id=? OR attachment_id IN '
        '(SELECT id FROM attachments WHERE owner_id=?)', (uid, uid)
    )
    c.execute('DELETE FROM reactions WHERE user_id=?', (uid,))
    c.execute('DELETE FROM group_members WHERE user_id=?', (uid,))
    c.execute('DELETE FROM attachments WHERE owner_id=?', (uid,))

    # Session tokens, friends, blocks and all per-user preferences.
    c.execute('DELETE FROM chat_preferences WHERE user_id=? OR other_id=?', (uid, uid))
    c.execute(
        'DELETE FROM friendships WHERE u1=? OR u2=? OR requested_by=?',
        (uid, uid, uid)
    )
    c.execute('DELETE FROM blocks WHERE blocker_id=? OR blocked_id=?', (uid, uid))
    c.execute('DELETE FROM restrictions WHERE owner_id=? OR other_id=?', (uid, uid))
    c.execute('DELETE FROM notifications WHERE user_id=?', (uid,))
    c.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
    c.execute('DELETE FROM trusted_devices WHERE user_id=?', (uid,))
    c.execute('DELETE FROM login_challenges WHERE user_id=?', (uid,))

    # Remove recovery codes before the support tickets they reference.
    c.execute(
        'DELETE FROM recovery_grants WHERE user_id=? OR ticket_id IN '
        '(SELECT id FROM tickets WHERE owner_id=?)', (uid, uid)
    )
    c.execute(
        'DELETE FROM ticket_messages WHERE ticket_id IN '
        '(SELECT id FROM tickets WHERE owner_id=?)', (uid,)
    )
    c.execute('DELETE FROM tickets WHERE owner_id=?', (uid,))

    # Remove the previous completed registration to permit later re-registering
    # through the normal approval workflow, not by automatically restoring access.
    c.execute('DELETE FROM registrations WHERE username=?', (username,))

    result = c.execute(
        'DELETE FROM users WHERE id=? AND is_admin=0', (uid,)
    )
    if result.rowcount != 1:
        raise RuntimeError('Account was not deleted; transaction must roll back.')

    return {
        'deleted_user_id': uid,
        'username': username,
        'friend_ids': sorted(friend_ids),
        'group_peer_ids': sorted(group_peers),
        'filenames': filenames,
    }


# The queue is persisted in the same database as the account. Each claim and
# erasure runs in one transaction: a user's cancellation can win before the
# deadline, but cannot race a successful deletion claim.
DELETION_GRACE_SECONDS = 30 * 24 * 60 * 60


def purge_due_deletions(db, timestamp: int, limit: int = 25) -> list[dict]:
    """Purge only expired requests; safe to retry or run in multiple workers.

    Each user is claimed via a conditional DELETE ... RETURNING under the same
    transaction as the final account erasure. The caller handles websocket
    notifications and local-file cleanup after commit.
    """
    with db() as c:
        queued = c.execute(
            'SELECT user_id FROM account_deletion_requests '
            'WHERE purge_at<=? ORDER BY purge_at,user_id LIMIT ?',
            (timestamp, limit),
        ).fetchall()
    completed = []
    for row in queued:
        uid = row['user_id']
        with db() as c:
            claimed = c.execute(
                'DELETE FROM account_deletion_requests '
                'WHERE user_id=? AND purge_at<=? RETURNING user_id',
                (uid, timestamp),
            ).fetchone()
            if claimed:
                completed.append(delete_user_records(c, uid))
    return completed
