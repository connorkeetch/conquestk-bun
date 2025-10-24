defmodule RiskGameWeb.ErrorJSONTest do
  use RiskGameWeb.ConnCase, async: true

  test "renders 404" do
    assert RiskGameWeb.ErrorJSON.render("404.json", %{}) == %{errors: %{detail: "Not Found"}}
  end

  test "renders 500" do
    assert RiskGameWeb.ErrorJSON.render("500.json", %{}) ==
             %{errors: %{detail: "Internal Server Error"}}
  end
end
