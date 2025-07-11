"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface User {
  id: string;
  name: string;
  username: string;
  photoUrl: string;
}

interface Question {
  number: number;
  text: string;
}

interface Card {
  dbId: string; // Changed from id to dbId
  cardId: number;
  title: string;
  subtitle: string;
  questions: Question[];
  answers: Record<number, User>;
}


export default function Icebreaker() {
  const [user, setUser] = useState<User | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [participants, setParticipants] = useState<User[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<string>("");
  const [activeQuestion, setActiveQuestion] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isGameEnabled, setIsGameEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
  const [editSelectedParticipant, setEditSelectedParticipant] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const storedUser = sessionStorage.getItem("user");
      if (!storedUser) {
        router.push("/signin");
        return;
      }
      
      setUser(JSON.parse(storedUser));
      
      // Check if game is enabled
      try {
        const response = await fetch("/api/admin/game-state");
        const data = await response.json();
        setIsGameEnabled(data.isIcebreakerEnabled);
      } catch (err) {
        console.error("Error checking game status:", err);
        setError("Failed to check game status");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch user's card
        const cardRes = await fetch(`/api/icebreaker/card?userId=${user.id}`);
        if (!cardRes.ok) throw new Error("Failed to fetch card");
        const cardData = await cardRes.json();
        setCard(cardData);

        // Fetch participants
        const participantsRes = await fetch("/api/icebreaker/answers");
        if (!participantsRes.ok) throw new Error("Failed to fetch participants");
        const participantsData = await participantsRes.json();
        setParticipants(participantsData);

      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading game data");
      }
    };

    fetchData();
  }, [user]);

  // Get available participants for the current question
  const availableParticipants = useMemo(() => {
    if (!card || !participants) return [];

    // Initialize empty answers object if not present
    const answers = card.answers || {};

    // Get all user IDs that have been used in answers
    const usedParticipantIds = Object.values(answers).map((p: User) => p.id);

    // Filter out the current user and already used participants
    return participants.filter((p: User) => 
      p.id !== user?.id && !usedParticipantIds.includes(p.id)
    );
  }, [card, participants, user]);

  // Get available participants for editing (includes currently selected person)
  const editAvailableParticipants = useMemo(() => {
    if (!card || !participants || editingQuestion === null) return [];

    // Initialize empty answers object if not present
    const answers = card.answers || {};

    // Get all user IDs that have been used in answers, excluding the one being edited
    const usedParticipantIds = Object.entries(answers)
      .filter(([questionNum]) => parseInt(questionNum) !== editingQuestion)
      .map(([, p]) => (p as User).id);

    // Filter out the current user and already used participants (except the one being edited)
    return participants.filter((p: User) => 
      p.id !== user?.id && !usedParticipantIds.includes(p.id)
    );
  }, [card, participants, user, editingQuestion]);

  const handleSubmitAnswer = async (questionNumber: number) => {
    if (!user || !card || !selectedParticipant) return;

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/icebreaker/answers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId: card.dbId, // Now using dbId instead of id
          questionNumber,
          giverId: user.id,
          receiverId: selectedParticipant,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit answer");
      }

      // Refetch card data to update answers
      const cardRes = await fetch(`/api/icebreaker/card?userId=${user.id}`);
      if (!cardRes.ok) throw new Error("Failed to fetch updated card");
      const cardData = await cardRes.json();
      setCard(cardData);


      // Reset selection
      setSelectedParticipant("");
      setActiveQuestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAnswer = async (questionNumber: number) => {
    if (!user || !card) return;

    setIsSubmitting(true);
    setError("");

    try {
      if (editSelectedParticipant === "") {
        // Delete the answer if no participant is selected
        await handleDeleteAnswer(questionNumber);
      } else {
        // Update the answer with new participant
        const response = await fetch("/api/icebreaker/answers", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cardId: card.dbId,
            questionNumber,
            giverId: user.id,
            newReceiverId: editSelectedParticipant,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update answer");
        }

        // Refetch card data to update answers
        const cardRes = await fetch(`/api/icebreaker/card?userId=${user.id}`);
        if (!cardRes.ok) throw new Error("Failed to fetch updated card");
        const cardData = await cardRes.json();
        setCard(cardData);

      }

      // Reset edit state
      setEditSelectedParticipant("");
      setEditingQuestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnswer = async (questionNumber: number) => {
    if (!user || !card) return;

    try {
      const response = await fetch("/api/icebreaker/answers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId: card.dbId,
          questionNumber,
          giverId: user.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete answer");
      }

      // Refetch card data to update answers
      const cardRes = await fetch(`/api/icebreaker/card?userId=${user.id}`);
      if (!cardRes.ok) throw new Error("Failed to fetch updated card");
      const cardData = await cardRes.json();
      setCard(cardData);

    } catch (err) {
      throw err; // Re-throw so handleUpdateAnswer can catch it
    }
  };

  const startEditing = (questionNumber: number) => {
    setEditingQuestion(questionNumber);
    setEditSelectedParticipant("");
    // Clear any active new answer selection
    setActiveQuestion(null);
    setSelectedParticipant("");
  };

  const cancelEditing = () => {
    setEditingQuestion(null);
    setEditSelectedParticipant("");
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <div className="text-2xl text-gray-600">Ladataan...</div>
      </div>
    );
  }

  if (!isGameEnabled) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Peli ei ole vielä alkanut</h2>
          <p className="text-gray-600">Odota järjestäjän ilmoitusta pelin alkamisesta.</p>
        </div>
      </div>
    );
  }

  if (!user || !card) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-blue-50 to-indigo-50 p-4 flex items-center justify-center">
        <div className="text-2xl text-gray-600">Ladataan...</div>
      </div>
    );
  }

  const answeredQuestionsCount = Object.keys(card.answers || {}).length;
  const totalQuestions = card.questions.length;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-2 sm:p-4 icebreaker-page">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 mt-4 sm:mt-8 border-2 border-blue-200">
          <h1 className="text-4xl sm:text-5xl font-bold text-center mb-2 dancing-font">{card.title}</h1>
          <div className="w-32 h-1 bg-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-600 text-center mb-4 sm:mb-6 italic">{card.subtitle}</p>

          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <p className="text-blue-900 font-semibold">
              Löydetty {answeredQuestionsCount}/{totalQuestions} henkilöä
            </p>
            <p className="text-sm text-blue-800 mt-1 font-medium">
              Jokaiseen kysymykseen tarvitaan eri henkilö!
            </p>
          </div>



          <div className="space-y-4 sm:space-y-6">
            {card.questions.map((question) => (
              <div
                key={question.number}
                className={`p-4 rounded-lg border ${
                  card.answers?.[question.number]
                    ? "bg-green-50 border-green-200"
                    : activeQuestion === question.number
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                  <p className="text-base sm:text-lg flex-1 text-gray-900">
                    {question.number}. {question.text}
                  </p>
                  {card.answers?.[question.number] ? (
                    editingQuestion === question.number ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 self-stretch">
                        <select
                          value={editSelectedParticipant}
                          onChange={(e) => setEditSelectedParticipant(e.target.value)}
                          className="p-2 sm:p-1 border rounded text-base sm:text-sm min-w-[200px] text-gray-900"
                        >
                          <option value="" className="text-gray-900">Poista vastaus</option>
                          <option value={card.answers[question.number].id} className="text-gray-900">
                            {card.answers[question.number].name} (nykyinen)
                          </option>
                          {editAvailableParticipants.map((participant) => (
                            <option key={participant.id} value={participant.id} className="text-gray-900">
                              {participant.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateAnswer(question.number)}
                            disabled={isSubmitting}
                            className="flex-1 sm:flex-none px-4 py-2 sm:py-1 bg-blue-600 text-white rounded-lg sm:rounded hover:bg-blue-700 disabled:opacity-50 text-base sm:text-sm"
                          >
                            {isSubmitting ? "..." : (editSelectedParticipant === "" ? "Poista" : "Päivitä")}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="flex-1 sm:flex-none px-4 py-2 sm:py-1 bg-gray-100 text-gray-700 rounded-lg sm:rounded hover:bg-gray-200 text-base sm:text-sm"
                          >
                            Peru
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 self-end sm:self-start">
                        <div className="relative w-8 h-8 sm:w-6 sm:h-6 rounded-full overflow-hidden">
                          <Image
                            src={card.answers[question.number].photoUrl}
                            alt={card.answers[question.number].name}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <span className="text-green-800 font-semibold">
                          {card.answers[question.number].name}
                        </span>
                        <button
                          onClick={() => startEditing(question.number)}
                          className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          title="Muokkaa vastausta"
                        >
                          Muokkaa
                        </button>
                      </div>
                    )
                  ) : activeQuestion === question.number ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 self-stretch">
                      <select
                        value={selectedParticipant}
                        onChange={(e) => setSelectedParticipant(e.target.value)}
                        className={`p-2 sm:p-1 border rounded text-base sm:text-sm min-w-[200px] text-gray-900 ${
                          availableParticipants.length === 0 ? "bg-gray-100" : ""
                        }`}
                        disabled={availableParticipants.length === 0}
                      >
                        <option value="" className="text-gray-900">
                          {availableParticipants.length === 0 
                            ? "Ei vapaita henkilöitä" 
                            : "Valitse henkilö"}
                        </option>
                        {availableParticipants.map((participant) => (
                          <option key={participant.id} value={participant.id} className="text-gray-900">
                            {participant.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSubmitAnswer(question.number)}
                          disabled={!selectedParticipant || isSubmitting || availableParticipants.length === 0}
                          className="flex-1 sm:flex-none px-4 py-2 sm:py-1 bg-green-600 text-white rounded-lg sm:rounded hover:bg-green-700 disabled:opacity-50 text-base sm:text-sm"
                        >
                          {isSubmitting ? "..." : "Tallenna"}
                        </button>
                        <button
                          onClick={() => {
                            setActiveQuestion(null);
                            setSelectedParticipant("");
                          }}
                          className="flex-1 sm:flex-none px-4 py-2 sm:py-1 bg-gray-100 text-gray-700 rounded-lg sm:rounded hover:bg-gray-200 text-base sm:text-sm"
                        >
                          Peru
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveQuestion(question.number)}
                      disabled={availableParticipants.length === 0 || editingQuestion !== null}
                      className="w-full sm:w-auto px-4 py-2 sm:py-1 bg-blue-600 text-white rounded-lg sm:rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-sm"
                    >
                      {editingQuestion !== null
                        ? "Lopeta muokkaus ensin"
                        : availableParticipants.length === 0 
                        ? "Ei vapaita henkilöitä" 
                        : "Valitse henkilö"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}