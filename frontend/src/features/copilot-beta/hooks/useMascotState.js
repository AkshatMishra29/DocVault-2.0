import { useState } from "react";

export function useMascotState(initialState = "idle") {
  const [mascotState, setMascotState] = useState(initialState);
  return [mascotState, setMascotState];
}
