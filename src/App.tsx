import { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { initialLicenses } from "./demo/data";
import "./App.css";

export default function App() {
  const [signedIn, setSignedIn] = useState(
    () => sessionStorage.getItem("early-learning-demo") === "yes",
  );
  const [licenses, setLicenses] = useState(initialLicenses);
  function changeSession(value: boolean) {
    if (value) sessionStorage.setItem("early-learning-demo", "yes");
    else sessionStorage.removeItem("early-learning-demo");
    setSignedIn(value);
  }
  return (
    <BrowserRouter>
      <AppRoutes
        signedIn={signedIn}
        onSessionChange={changeSession}
        licenses={licenses}
        onLicensesChange={setLicenses}
      />
    </BrowserRouter>
  );
}
