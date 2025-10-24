defmodule RiskGame.Repo do
  use Ecto.Repo,
    otp_app: :risk_game,
    adapter: Ecto.Adapters.Postgres

  # Set the search path to use our separate schema
  # This prevents conflicts with the Node.js app's tables
  def set_search_path(conn) do
    Postgrex.query!(conn, "SET search_path TO elixir_risk,public", [])
  end
end
