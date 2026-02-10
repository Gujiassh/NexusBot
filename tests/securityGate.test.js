import test from "node:test";
import assert from "node:assert/strict";

import {
  checkInteractionAccess,
  checkMessageAccess,
  isDmContext,
  isOwnerUser,
} from "../src/services/discordClient.js";

const cfg = {
  ownerUserId: "owner-1",
};

test("isOwnerUser matches configured owner", () => {
  assert.equal(isOwnerUser("owner-1", cfg), true);
  assert.equal(isOwnerUser("other", cfg), false);
});

test("isDmContext checks guildId null", () => {
  assert.equal(isDmContext({ guildId: null }), true);
  assert.equal(isDmContext({ guildId: "123" }), false);
});

test("checkMessageAccess allows owner DM only", () => {
  const allowed = checkMessageAccess(
    {
      author: { id: "owner-1", bot: false },
      guildId: null,
    },
    cfg
  );
  assert.equal(allowed.allowed, true);

  const deniedOwnerInGuild = checkMessageAccess(
    {
      author: { id: "owner-1", bot: false },
      guildId: "guild-1",
    },
    cfg
  );
  assert.equal(deniedOwnerInGuild.allowed, false);

  const deniedNonOwner = checkMessageAccess(
    {
      author: { id: "other", bot: false },
      guildId: null,
    },
    cfg
  );
  assert.equal(deniedNonOwner.allowed, false);
});

test("checkInteractionAccess allows owner DM only", () => {
  const allowed = checkInteractionAccess(
    {
      user: { id: "owner-1" },
      guildId: null,
    },
    cfg
  );
  assert.equal(allowed.allowed, true);

  const denied = checkInteractionAccess(
    {
      user: { id: "other" },
      guildId: null,
    },
    cfg
  );
  assert.equal(denied.allowed, false);
});
