defmodule RiskGameWeb.PageController do
  use RiskGameWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
