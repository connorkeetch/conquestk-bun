defmodule RiskGameWeb.HomeLive do
  use RiskGameWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Home")}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="min-h-screen">
      <%!-- Hero Section --%>
      <section class="overflow-hidden section-spacing">
        <div class="relative container mx-auto px-6 max-w-6xl flex flex-col items-center">
          <h1 class="mt-2 text-[clamp(2rem,3.8vw,3.5rem)] font-bold leading-tight text-white text-center">
            Welcome to the <span class="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-violet-400">
              Conquest
            </span>
          </h1>

          <p class="mt-3 mx-auto max-w-[52ch] text-white/80 text-center text-lg md:text-xl">
            Rewrite borders. ConquestK notarizes every triumphant march and embarrassing retreat.
          </p>

          <div class="mt-7 flex items-center justify-center gap-3">
            <%= if assigns[:current_user] do %>
              <.link navigate={~p"/lobby"} class="btn-primary btn-lg">
                Wage War →
              </.link>
              <.link navigate={~p"/map-editor"} class="btn-secondary btn-lg">
                Forge a Map
              </.link>
            <% else %>
              <.link navigate={~p"/users/register"} class="btn-primary btn-lg">
                Plot Your Coup →
              </.link>
              <.link navigate={~p"/users/log-in"} class="btn-secondary btn-lg">
                Veteran Login
              </.link>
            <% end %>
          </div>
        </div>
      </section>

      <%!-- Epic Battle Image Section --%>
      <section class="relative z-10 section-spacing-sm overflow-hidden">
        <div class="container mx-auto px-6 max-w-6xl">
          <div class="relative h-80 md:h-[500px] rounded-2xl border border-border p-12
                      shadow-[inset_0_1px_0_0_rgba(255,255,255,.06)]
                      flex items-center justify-center overflow-hidden bg-surface-1">
            <%!-- Dark overlay --%>
            <div class="absolute inset-0 bg-[color:color-mix(in_srgb,var(--surface-1)_80%,black)] rounded-2xl">
            </div>

            <%!-- Gradient overlay --%>
            <div class="absolute inset-0 bg-gradient-to-t from-[color:color-mix(in_srgb,black_50%,transparent)] via-transparent to-transparent rounded-2xl">
            </div>

            <%!-- Battle Text Overlay --%>
            <div class="relative z-10 text-center px-8">
              <h2 class="text-3xl md:text-5xl font-bold mb-4">
                <span class="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  CONQUER OR BE CONQUERED
                </span>
              </h2>
              <p class="text-xl text-muted max-w-2xl mx-auto">
                Deploy armies • Capture Territories • Conquer your opposition
              </p>
            </div>
          </div>
        </div>
      </section>

      <%!-- Systems & Modes --%>
      <section class="relative z-10 section-spacing-sm">
        <div class="container mx-auto px-6 max-w-6xl">
          <div class="text-center mb-8">
            <h2 class="text-2xl md:text-3xl font-bold">
              <span class="text-white">Systems & Modes</span>
            </h2>
            <p class="text-muted text-sm">The parts that matter on game night. No fluff.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <%= for offering <- offerings() do %>
              <div class="panel p-5 group hover:-translate-y-0.5 transition">
                <div class="flex items-start gap-3">
                  <div class="text-2xl flex-shrink-0"><%= offering.icon %></div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="text-white font-medium"><%= offering.title %></h3>
                      <%= if offering[:status] == "coming-soon" do %>
                        <span class="ml-auto text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      <% end %>
                    </div>
                    <p class="mt-2 text-sm text-white/70"><%= offering.blurb %></p>

                    <%= if offering[:badges] do %>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <%= for badge <- offering.badges do %>
                          <span class="text-[10px] uppercase tracking-wide text-muted bg-surface-1/50 border border-border px-2 py-0.5 rounded-full">
                            <%= badge %>
                          </span>
                        <% end %>
                      </div>
                    <% end %>
                  </div>
                </div>
              </div>
            <% end %>
          </div>
        </div>
      </section>

      <%!-- How It Works --%>
      <section class="relative z-10 section-spacing-sm">
        <div class="container mx-auto px-6 max-w-5xl">
          <div class="text-center mb-8">
            <h2 class="text-2xl md:text-3xl font-bold mb-2">
              <span class="text-white">How to seize the map</span>
            </h2>
            <p class="text-muted text-sm">
              Memorize these three pillars before you start renaming sectors after yourself.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="panel p-5 text-center">
              <div class="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                1
              </div>
              <h3 class="text-lg font-medium text-heading mb-2">Deploy reinforcements</h3>
              <p class="text-muted text-sm">
                Place troops to secure borders and set up your push.
              </p>
            </div>
            <div class="panel p-5 text-center">
              <div class="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                2
              </div>
              <h3 class="text-lg font-medium text-heading mb-2">Attack and adapt</h3>
              <p class="text-muted text-sm">
                Roll the attacks, pivot fronts, and seize bonuses.
              </p>
            </div>
            <div class="panel p-5 text-center">
              <div class="w-10 h-10 mx-auto mb-3 bg-gradient-to-br from-sky-500 to-indigo-500 rounded-full flex items-center justify-center text-base font-bold text-white">
                3
              </div>
              <h3 class="text-lg font-medium text-heading mb-2">Fortify the line</h3>
              <p class="text-muted text-sm">
                Reposition armies to lock borders and hold gains.
              </p>
            </div>
          </div>
        </div>
      </section>

      <%!-- Final CTA --%>
      <section class="relative z-10 section-spacing">
        <div class="container mx-auto px-6 max-w-4xl">
          <div class="panel p-8 md:p-12 text-center">
            <h2 class="text-3xl font-bold text-white">
              Whose banner will fly over the battlefield?
            </h2>
            <p class="mt-4 text-white/80 text-base md:text-lg">
              The beta is online. Rally your troops and conquer the map.
            </p>
            <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <%= if assigns[:current_user] do %>
                <.link navigate={~p"/lobby"} class="btn-primary btn-lg w-full sm:w-auto">
                  Rejoin the Front
                </.link>
                <.link navigate={~p"/maps"} class="btn-secondary btn-lg w-full sm:w-auto">
                  Inspect Warzones
                </.link>
              <% else %>
                <.link navigate={~p"/users/register"} class="btn-primary btn-lg w-full sm:w-auto">
                  Start your Conquest →
                </.link>
                <.link navigate={~p"/learn"} class="btn-secondary btn-lg w-full sm:w-auto">
                  Review Field Manual
                </.link>
              <% end %>
            </div>
          </div>
        </div>
      </section>
    </div>
    """
  end

  # Data for offerings grid
  defp offerings do
    [
      %{
        icon: "🎮",
        title: "Game Modes",
        blurb: "Domination, Capitals, King of the Hill, and Assassination — play FFA or teams.",
        badges: ["Domination", "Capitals", "KOTH", "Assassination"]
      },
      %{
        icon: "👥",
        title: "Players & Teams",
        blurb: "Up to 12 players with up to 6 teams. Queue FFA or coordinate in squads.",
        badges: ["12 players", "Up to 6 teams", "FFA/Teams"]
      },
      %{
        icon: "⏱️",
        title: "Live & 24h Turns",
        blurb: "Run live sessions or asynchronous 24‑hour turns with ready‑checks and AFK rules.",
        badges: ["Live", "24h", "Ready‑check"]
      },
      %{
        icon: "💎",
        title: "Hidden Treasures",
        blurb: "Redeem sets of 3 (bronze/silver/gold/diamond) for reinforcements.",
        badges: ["Sets of 3", "Diamond bonus"]
      },
      %{
        icon: "🌫️",
        title: "Fog of War",
        blurb: "Choose Open or Fog — you can only target what you can see.",
        badges: ["Open", "Fog"]
      },
      %{
        icon: "🤖",
        title: "AI Commanders",
        blurb: "Commander & Grandmaster tiers that respect team rules and play fast, fair turns.",
        badges: ["Commander", "Grandmaster", "Fill seats"]
      },
      %{
        icon: "🎨",
        title: "Customization",
        blurb:
          "16 player colors (12 standard + 4 premium) and premium themes with animated backdrops.",
        badges: ["16 colors", "Premium themes"]
      },
      %{
        icon: "🎬",
        title: "Replays & Receipts",
        blurb: "Timeline, turn diffs, dice logs, and fortify paths — no guesswork.",
        badges: ["Timeline", "Turn diffs", "Dice logs"]
      },
      %{
        icon: "🗺️",
        title: "Map Editor",
        blurb: "Build sectors, adjacencies, and capitals; submit for review, then publish.",
        badges: ["Draft → Review → Publish"]
      },
      %{
        icon: "🏆",
        title: "Ranks & Clans",
        blurb: "Conquest Points (Elo‑inspired) ranking, seasonal ladders, and clan campaigns.",
        badges: ["CP ranking", "Ladders", "Clans"]
      }
    ]
  end
end
