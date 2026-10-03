import "./style.css";
import { mountApp } from "./ui/app";
import { parseSeed } from "./game/rng";

const root = document.getElementById("app");
if (root) {
  const seed = parseSeed(new URLSearchParams(window.location.search).get("seed"));
  mountApp(root, { seed });
}
