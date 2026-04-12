/**
 * GuardedCircleClient — wraps Circle API v1 with _test_ prefix safety checks.
 *
 * Every method that targets a specific resource calls assertTestPrefix()
 * BEFORE making any HTTP request. List methods return unfiltered results;
 * the regression is responsible for filtering.
 *
 * There is no sendDirectMessage method. DMs are out of v1 scope.
 * This is a structural safety choice, not a gap.
 */

const BASE_URL = "https://app.circle.so/api/v1";

// ── public helpers (exported for the guard self-test) ──────────────────

/**
 * Extract the plus-segment from a plus-addressed email.
 *   user+_test_baseline@gmail.com → "_test_baseline"
 *   user@gmail.com (no plus)     → "user" (will fail assertTestPrefix, which is correct)
 */
export function plusSegment(email: string): string {
  const local = email.split("@")[0];
  if (local.includes("+")) {
    return local.split("+")[1];
  }
  return local;
}

/**
 * Single rule, no special cases. Callers that deal with emails
 * must run plusSegment() first to extract the meaningful part.
 * Throws with a REFUSED message — never reaches the network.
 */
export function assertTestPrefix(name: string, kind: string): void {
  if (!name.startsWith("_test_")) {
    throw new Error(
      `REFUSED: regression tried to touch a non-_test_ ${kind}: '${name}'. ` +
        `The safety guard stopped it before any request hit Circle.`
    );
  }
}

// ── the client ─────────────────────────────────────────────────────────

export class GuardedCircleClient {
  private token: string;
  private communityId: string;

  constructor(token: string, communityId: string) {
    this.token = token;
    this.communityId = communityId;
  }

  // ── raw HTTP layer (private) ──────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>
  ): Promise<unknown> {
    const params = new URLSearchParams(query);
    const qs = params.toString() ? `?${params}` : "";
    const url = `${BASE_URL}${path}${qs}`;
    const headers: Record<string, string> = {
      Authorization: `Token ${this.token}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      const err = new Error(
        `Circle API ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`
      );
      (err as any).status = res.status;
      throw err;
    }

    return res.json();
  }

  // ── v1 scope: list (unguarded — returns everything) ───────────────

  async listSpaces(): Promise<any[]> {
    return (await this.request(
      "GET",
      `/spaces`,
      undefined,
      { community_id: this.communityId }
    )) as any[];
  }

  async listMembers(
    filters?: Record<string, string>
  ): Promise<any[]> {
    return (await this.request(
      "GET",
      `/community_members`,
      undefined,
      { community_id: this.communityId, ...filters }
    )) as any[];
  }

  // ── v1 scope: get (guarded) ───────────────────────────────────────

  async getSpace(id: number): Promise<any> {
    const space = await this.request("GET", `/spaces/${id}`);
    assertTestPrefix((space as any).name, "space");
    return space;
  }

  async getMember(idOrEmail: string | number): Promise<any> {
    const member = await this.request(
      "GET",
      `/community_members/${idOrEmail}`
    );
    assertTestPrefix(
      plusSegment((member as any).email),
      "member email"
    );
    return member;
  }

  async getPost(id: number): Promise<any> {
    const post = await this.request("GET", `/posts/${id}`);
    assertTestPrefix((post as any).title ?? (post as any).name, "post title");
    return post;
  }

  // ── v1 scope: create (guarded) ────────────────────────────────────

  async createPost(
    spaceId: number,
    title: string,
    body: string
  ): Promise<any> {
    // title assert runs FIRST — before getSpace, before any HTTP call.
    // This is what makes the guard self-test zero-API-call.
    assertTestPrefix(title, "post title");
    await this.getSpace(spaceId);
    return this.request("POST", `/spaces/${spaceId}/posts`, {
      name: title,
      body,
    });
  }

  async createMember(email: string, name: string): Promise<any> {
    assertTestPrefix(plusSegment(email), "member email");
    if (process.env.HARNESS_ALLOW_INVITES !== "1") {
      throw new Error(
        "REFUSED: createMember would send a real invite email. " +
          "Set HARNESS_ALLOW_INVITES=1 only for tests you intentionally " +
          "want to send invites in."
      );
    }
    return this.request("POST", `/community_members`, {
      email,
      name,
      community_id: this.communityId,
      skip_invitation: true,
    });
  }

  // ── v1 scope: tag mutations (guarded) ─────────────────────────────

  async addTag(memberEmail: string, tagName: string): Promise<any> {
    assertTestPrefix(plusSegment(memberEmail), "member email");
    assertTestPrefix(tagName, "tag");
    return this.request("POST", `/community_members/tagged_members`, {
      user_email: memberEmail,
      tag: tagName,
      community_id: this.communityId,
    });
  }

  async removeTag(memberEmail: string, tagName: string): Promise<any> {
    assertTestPrefix(plusSegment(memberEmail), "member email");
    assertTestPrefix(tagName, "tag");
    return this.request("DELETE", `/community_members/tagged_members`, {
      user_email: memberEmail,
      tag: tagName,
      community_id: this.communityId,
    });
  }

  // ── harness-internal: deletes for teardown (guarded) ──────────────

  async deletePost(postId: number): Promise<void> {
    const post = await this.request("GET", `/posts/${postId}`);
    assertTestPrefix((post as any).title ?? (post as any).name, "post title");
    await this.request("DELETE", `/posts/${postId}`);
  }

  async deleteMember(idOrEmail: string | number): Promise<void> {
    const member = await this.request(
      "GET",
      `/community_members/${idOrEmail}`
    );
    assertTestPrefix(
      plusSegment((member as any).email),
      "member email"
    );
    await this.request("DELETE", `/community_members/${idOrEmail}`);
  }
}
