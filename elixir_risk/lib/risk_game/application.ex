defmodule RiskGame.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      RiskGameWeb.Telemetry,
      RiskGame.Repo,
      {DNSCluster, query: Application.get_env(:risk_game, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: RiskGame.PubSub},
      # Registry for game server lookup
      {Registry, keys: :unique, name: RiskGame.GameRegistry},
      # GameSupervisor for dynamic game processes
      RiskGame.Games.GameSupervisor,
      # Start to serve requests, typically the last entry
      RiskGameWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: RiskGame.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    RiskGameWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
