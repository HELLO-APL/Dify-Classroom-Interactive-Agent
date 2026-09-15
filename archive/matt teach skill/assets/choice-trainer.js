function createChoiceTrainer(root, questions) {
  let index = 0;
  let streak = 0;
  let best = 0;

  const prompt = root.querySelector("[data-prompt]");
  const choices = root.querySelector("[data-choices]");
  const feedback = root.querySelector("[data-feedback]");
  const streakEl = root.querySelector("[data-streak]");
  const bestEl = root.querySelector("[data-best]");
  const reset = root.querySelector("[data-reset]");

  function render() {
    const question = questions[index];
    prompt.textContent = question.prompt;
    feedback.textContent = "";
    feedback.className = "feedback";
    choices.innerHTML = "";

    question.choices.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice;
      button.addEventListener("click", () => answer(choice));
      choices.appendChild(button);
    });

    streakEl.textContent = streak;
    bestEl.textContent = best;
  }

  function answer(choice) {
    const question = questions[index];
    if (choice === question.answer) {
      streak += 1;
      best = Math.max(best, streak);
      feedback.textContent = question.ok;
      feedback.className = "feedback ok";
      index = (index + 1) % questions.length;
      window.setTimeout(render, 650);
    } else {
      streak = 0;
      feedback.textContent = question.bad;
      feedback.className = "feedback bad";
      streakEl.textContent = streak;
      bestEl.textContent = best;
    }
  }

  reset.addEventListener("click", () => {
    index = 0;
    streak = 0;
    best = 0;
    render();
  });

  render();
}
